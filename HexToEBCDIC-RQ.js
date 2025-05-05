const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const xml2js = require('xml2js');

// EBCDIC Hex Table
const ebcdicTable = {
  '00': '<NUL>', '01': '<SOH>', '02': '<STX>', '03': '<ETX>', '04': '<SEL>', '05': '<HT>', '06': '<RNL>', '07': '<DEL>',
  '08': '<GE>', '09': '<SPS>', '0A': '<RPT>', '0B': '<VT>', '0C': '<FF>', '0D': '\r', '0E': '<SO>', '0F': '<SI>',
  '10': '<DLE>', '11': '<DC1>', '12': '<DC2>', '13': '<DC3>', '14': '<RES/ENP>', '15': '<NL>', '16': '<BS>', '17': '<POC>',
  '18': '<CAN>', '19': '<EM>', '1A': '<UBS>', '1B': '<CU1>', '1C': '<IFS>', '1D': '<IGS>', '1E': '<IRS>', '1F': '<ITB/IUS>',
  '20': '<DS>', '21': '<SOS>', '22': '<FS>', '23': '<WUS>', '24': '<BYP/INP>', '25': '<LF>', '26': '<ETB>', '27': '<ESC>',
  '28': '<SA>', '29': '<SFE>', '2A': '<SM/SW>', '2B': '<CSP>', '2C': '<MFA>', '2D': '<ENQ>', '2E': '<ACK>', '2F': '<BEL>',
  '30': '', '31': '', '32': '<SYN>', '33': '<IR>', '34': '<PP>', '35': '<TRN>', '36': '<NBS>', '37': '<EOT>',
  '38': '<SBS>', '39': '<IT>', '3A': '<RFF>', '3B': '<CU3>', '3C': '<DC4>', '3D': '<NAK>', '3E': '', '3F': '<SUB>',
  '40': ' ', '4A': '[', '4B': '.', '4C': '<', '4D': '(', '4E': '+', '4F': '!', '50': '&',
  '5A': ']', '5B': '$', '5C': '*', '5D': ')', '5E': ';', '5F': '^', '60': '_', '61': '/',
  '6A': '|', '6B': ',', '6C': '%', '6D': '_', '6E': '>', '6F': '?', '79': '`', '7A': ':',
  '7B': '#', '7C': '@', '7D': "'", '7E': '=', '7F': '"',
  '81': 'a', '82': 'b', '83': 'c', '84': 'd', '85': 'e', '86': 'f', '87': 'g', '88': 'h', '89': 'i',
  '91': 'j', '92': 'k', '93': 'l', '94': 'm', '95': 'n', '96': 'o', '97': 'p', '98': 'q', '99': 'r',
  'A1': '~', 'A2': 's', 'A3': 't', 'A4': 'u', 'A5': 'v', 'A6': 'w', 'A7': 'x', 'A8': 'y', 'A9': 'z',
  'C1': 'A', 'C2': 'B', 'C3': 'C', 'C4': 'D', 'C5': 'E', 'C6': 'F', 'C7': 'G', 'C8': 'H', 'C9': 'I',
  'D1': 'J', 'D2': 'K', 'D3': 'L', 'D4': 'M', 'D5': 'N', 'D6': 'O', 'D7': 'P', 'D8': 'Q', 'D9': 'R',
  'E2': 'S', 'E3': 'T', 'E4': 'U', 'E5': 'V', 'E6': 'W', 'E7': 'X', 'E8': 'Y', 'E9': 'Z',
  'F0': '0', 'F1': '1', 'F2': '2', 'F3': '3', 'F4': '4', 'F5': '5', 'F6': '6', 'F7': '7', 'F8': '8', 'F9': '9',
};

function hexToEBCDIC(hexStr) {
  let output = '';
  for (let i = 0; i < hexStr.length; i += 2) {
    const byte = hexStr.substr(i, 2).toUpperCase();
    output += ebcdicTable[byte] || '.';
  }
  return output;
}

// Parse CLI args
program
  .option('-t, --trancode <file>', 'Include MBASE Schema', 'DFDL.xml')
  .option('-r, --response <file>', 'Include Response file', 'DFDLRES.txt')
  .option('-s, --strip', 'Strip trailing zeros and whitespace', false)
  .option('-l, --length <num>', 'Set header length for slicing', parseInt, 688)
  .parse();

const options = program.opts();

// Main
(async () => {
  const xmlStr = fs.readFileSync(options.trancode, 'utf8');
  const xmlParsed = await xml2js.parseStringPromise(xmlStr);

  const types = xmlParsed['xsd:schema']['xsd:complexType'];
  const rqType = types.find(t => t['$'] && t['$'].name && t['$'].name.toLowerCase().includes('rqtype'));
  const root = rqType['xsd:sequence'][0]['xsd:element'];

  const responseBase64 = fs.readFileSync(options.response, 'utf8');
  const responseDecoded = Buffer.from(responseBase64, 'base64').toString('utf8');
  const cleaned = responseDecoded.replace(/X'/g, '').replace(/'/g, '');

  const ebcdicText = hexToEBCDIC(cleaned);
  const body = ebcdicText.slice(options.length, -1);

  const resultLines = [];
  resultLines.push(`PARSING ---------------: ${options.response}`);
  resultLines.push(`USING DFDL ------------: ${options.trancode}`);
  resultLines.push(`RESPONSE HEADER LENGTH : ${options.length}`);
  resultLines.push(`RESPONSE BODY LENGTH --: ${body.length}`);
  resultLines.push(`TRAILING SPACE & 0 ----: ${!options.strip}\n`);

  let cursor = 0;
  const fields = {};

  for (const el of root) {
    const name = el['$'].name;
    const len = parseInt(el['$']['dfdl:length'] || '26');
    fields[name] = body.substring(cursor, cursor + len);
    cursor += len;
  }

  for (const [k, v] of Object.entries(fields)) {
    const value = options.strip ? (v.trim().replace(/^0+/, '') || '0') : v;
    resultLines.push(`${k.padEnd(16)}: ${value} (length : ${v.length})`);
  }

  resultLines.push(`\n\nESB_PROVIDER_RES_AUDITIN BASE64 : \n${responseBase64}`);
  resultLines.push(`\n\nESB_PROVIDER_RES_AUDITIN BASE64 DECODE : \n${cleaned}`);
  resultLines.push(`\n\nEBCDIC OUTPUT FULL : \n${ebcdicText}`);
  resultLines.push(`\n\nEBCDIC OUTPUT RES BODY : \n${body}`);

  fs.writeFileSync('results.txt', resultLines.join('\n'), 'utf8');
  console.log('Output written to results.txt');

  // Optional: open results.txt automatically on Windows
  if (process.platform === 'win32') {
    require('child_process').exec(`start "" "${path.join(process.cwd(), 'results.txt')}"`);
  }
})();
