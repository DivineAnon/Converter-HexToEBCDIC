const fs = require('fs');
const path = require('path');
const yargs = require('yargs');
const { hideBin } = require('yargs/helpers');
const xml2js = require('xml2js');

// Command line arguments
const argv = yargs(hideBin(process.argv))
  .option('trancode', { alias: 't', type: 'string', default: 'DFDL.xml' })
  .option('response', { alias: 'r', type: 'string', default: 'DFDLRES.txt' })
  .option('strip', { alias: 's', type: 'boolean', default: false })
  .option('length', { alias: 'l', type: 'number', default: 688 })
  .argv;

// EBCDIC Hex Table
function ebcdicTable(hex) {
  const map = {
    '00': '<NUL>', '01': '<SOH>', '02': '<STX>', '03': '<ETX>', '04': '<SEL>', '05': '<HT>', '06': '<RNL>',
    '07': '<DEL>', '08': '<GE>', '09': '<SPS>', '0A': '<RPT>', '0B': '<VT>', '0C': '<FF>', '0D': '\r',
    '0E': '<SO>', '0F': '<SI>', '10': '<DLE>', '11': '<DC1>', '12': '<DC2>', '13': '<DC3>', '14': '<RES/ENP>',
    '15': '<NL>', '16': '<BS>', '17': '<POC>', '18': '<CAN>', '19': '<EM>', '1A': '<UBS>', '1B': '<CU1>',
    '1C': '<IFS>', '1D': '<IGS>', '1E': '<IRS>', '1F': '<ITB/IUS>', '20': '<DS>', '21': '<SOS>', '22': '<FS>',
    '23': '<WUS>', '24': '<BYP/INP>', '25': '<LF>', '26': '<ETB>', '27': '<ESC>', '28': '<SA>', '29': '<SFE>',
    '2A': '<SM/SW>', '2B': '<CSP>', '2C': '<MFA>', '2D': '<ENQ>', '2E': '<ACK>', '2F': '<BEL>', '30': '',
    '31': '', '32': '<SYN>', '33': '<IR>', '34': '<PP>', '35': '<TRN>', '36': '<NBS>', '37': '<EOT>',
    '38': '<SBS>', '39': '<IT>', '3A': '<RFF>', '3B': '<CU3>', '3C': '<DC4>', '3D': '<NAK>', '3E': '',
    '3F': '<SUB>', '40': ' ', '41': '<RSP>', '42': '', '43': '', '44': '', '45': '', '46': '', '47': '',
    '48': '', '49': '', '4A': '[', '4B': '.', '4C': '<', '4D': '(', '4E': '+', '4F': '!', '50': '&',
    '5A': ']', '5B': '$', '5C': '*', '5D': ')', '5E': ';', '5F': '^', '60': '_', '61': '/',
    '6A': '|', '6B': ',', '6C': '%', '6D': '_', '6E': '>', '6F': '?', '79': '`', '7A': ':', '7B': '#',
    '7C': '@', '7D': "'", '7E': '=', '7F': '"',
    '81': 'a', '82': 'b', '83': 'c', '84': 'd', '85': 'e', '86': 'f', '87': 'g', '88': 'h', '89': 'i',
    '8B': '{', '8F': '+',
    '91': 'j', '92': 'k', '93': 'l', '94': 'm', '95': 'n', '96': 'o', '97': 'p', '98': 'q', '99': 'r',
    '9B': '}',
    'A1': '~', 'A2': 's', 'A3': 't', 'A4': 'u', 'A5': 'v', 'A6': 'w', 'A7': 'x', 'A8': 'y', 'A9': 'z',
    'AD': '[', 'C0': '{',
    'C1': 'A', 'C2': 'B', 'C3': 'C', 'C4': 'D', 'C5': 'E', 'C6': 'F', 'C7': 'G', 'C8': 'H', 'C9': 'I',
    'D0': '}', 'D1': 'J', 'D2': 'K', 'D3': 'L', 'D4': 'M', 'D5': 'N', 'D6': 'O', 'D7': 'P', 'D8': 'Q', 'D9': 'R',
    'E0': '\\', 'E2': 'S', 'E3': 'T', 'E4': 'U', 'E5': 'V', 'E6': 'W', 'E7': 'X', 'E8': 'Y', 'E9': 'Z',
    'F0': '0', 'F1': '1', 'F2': '2', 'F3': '3', 'F4': '4', 'F5': '5', 'F6': '6', 'F7': '7', 'F8': '8', 'F9': '9'
  };
  return map[hex.toUpperCase()] || '�';
}

// Convert hex string to EBCDIC
function transform(hexStr) {
  let result = '';
  for (let i = 0; i < hexStr.length; i += 2) {
    let hexByte = hexStr.substring(i, i + 2);
    result += ebcdicTable(hexByte);
  }
  return result;
}

// Main process
(async () => {
  const xml = fs.readFileSync(argv.trancode, 'utf-8');
  const parser = new xml2js.Parser();
  const doc = await parser.parseStringPromise(xml);
  const complexTypes = doc['xsd:schema']['xsd:complexType'];
  const match = complexTypes.find(x => x.$.name.toLowerCase().includes('rstype'));
  const elements = match['xsd:sequence'][0]['xsd:element'];

  // Read base64 response
  const base64 = fs.readFileSync(argv.response, 'utf-8');
  const b64Decoded = Buffer.from(base64, 'base64').toString('utf-8');
  const hexData = b64Decoded.replace(/X'/g, '').replace(/'/g, '');
  const ebcdicText = transform(hexData);
  const resBody = ebcdicText.substring(argv.length, ebcdicText.length - 1);

  let results = {};
  let offset = 0;
  let bodyLength = 0;

  for (let el of elements) {
    const name = el.$.name;
    const len = parseInt(el.$['dfdl:length'] || '26', 10);
    results[name] = resBody.substring(offset, offset + len);
    offset += len;
    bodyLength += len;
  }

  const outputPath = path.join(__dirname, 'results-js.txt');
  const out = fs.createWriteStream(outputPath);
  out.write(`PARSING ----------------------: ${argv.response}\n`);
  out.write(`USING DFDL -------------------: ${argv.trancode}\n`);
  out.write(`RESPONSE HEADER LENGTH--------: ${argv.length}\n`);
  out.write(`DFDL BODY LENGTH -------------: ${bodyLength}\n`);
  out.write(`ACTUAL RESPONSE BODY LENGTH --: ${resBody.length}\n`);
  out.write(`TRAILING SPACE & 0 -----------: ${!argv.strip}\n\n`);

  for (let [k, v] of Object.entries(results)) {
    let val = argv.strip ? (v.trim().replace(/^0+/, '') || '0') : v;
    out.write(`${k}\t\t: ${val} (length : ${v.length})\n`);
  }

  out.write(`\n\nESB_PROVIDER_RES_AUDITIN BASE64 : \n${base64}`);
  out.write(`\n\nESB_PROVIDER_RES_AUDITIN BASE64 DECODE : \n${hexData}`);
  out.write(`\n\nEBCDIC OUTPUT FULL : \n${ebcdicText}`);
  out.write(`\n\nEBCDIC OUTPUT RES BODY : \n${resBody}`);
  out.end();

  console.log(`Results written to ${outputPath}`);
})();
