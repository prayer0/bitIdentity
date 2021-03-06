
var isBrowser = isBrowser || new Function("try {return this===window;}catch(e){ return false;}");

var filepay;
var bsv;

const bitId_Protocol = "14kxqYv3emHGwf8m6YgSYLQkGCvn9Qrgr9";

const PLACEHOLDER_LEN = 150;
const placeholder = " ".repeat(PLACEHOLDER_LEN);


var filepayKey = "";
let log = console.log;


function checklib(){
	if(!filepay){
		filepay = require("filepay");
		bsv = filepay.bsv;
	}
}

function config(options){
	if(options.debug=false){
		log=(msg)=>{};
	}
	filepayKey = options.filepayKey;
}

var gentx = function (config) {
	checklib();
	return new Promise((resolve, reject) => {
		config.pay.to.forEach((out) => {
			if (out.protocol && out.protocol.toLowerCase() == "bitidentity") {
				const pk = bsv.PrivateKey.fromWIF(out.value.privateKey);
				const pubKey = bsv.PublicKey.fromPrivateKey(pk);
				out["data"] = [bitId_Protocol, pubKey.toString(), placeholder];
				out["pvalue"] = out.value;
				out.value = 0;
			}
		});
		log(config.pay.to);
		config.api_key = filepayKey;
		filepay.build(config, (e, tx) => {
			if (tx) {
				log("rawtx1=", tx.toString());
				let data2sign = genData2sign(tx);
				log("data2sign=" + data2sign);
				var hash = bsv.crypto.Hash.sha256(Buffer.from(data2sign));
				log("hash=" + hash.toString("hex"));
				config.pay.to.forEach((out) => {
					if (out.protocol && out.protocol.toLowerCase() == "bitidentity") {
						const pKey = bsv.PrivateKey.fromWIF(
							out.pvalue.privateKey
						);
						var sig = bsv.crypto.ECDSA.sign(hash, pKey);
						const sig_str = sig.toString();

						out.data[2] = sig_str.concat(
							" ".repeat(PLACEHOLDER_LEN - sig_str.length)
						);
						log("signature=" + sig_str);
						delete out.protocol;
						delete out.pvalue;
					}
				});
				log(config.pay.to);
				filepay.build(config, (e, tx) => {
					if (tx) {
						log("data2sign111=" + genData2sign(tx));
						log("rawtx=" + tx.toString());
						resolve(tx.toString());
					} else {
						reject(e);
					}
				});
			} else {
				reject(e);
			}
		});
	});
}

var verifyID = function(rawtx) {
	checklib();

	const tx = bsv.Transaction(rawtx);
	//log(tx);
	const data2sign = genData2sign(tx);
	//log("data2sign====="+data2sign);
	const bids = getBitID(tx);
	log(bids);
	var hash = bsv.crypto.Hash.sha256(Buffer.from(data2sign));
	//	log("hash="+hash.toString('hex'));
	//	log("sig="+sig.sig.toString());
	//	log("pubkey="+sig.publicKey.toString('hex'));
	if(bids.length>0){
		for (var i = 0; i < bids.length; i++) {
			const bid = bids[i];
			var verified = bsv.crypto.ECDSA.verify(hash, bid.sig, bid.publicKey);
			if (!verified) return false;
		}
		return true;
	}
	return false;
}

var getBitID = function(tx) {
	checklib();

	if(typeof tx ==="string"){
		tx = bsv.Transaction(tx);
	}
	let ret = [];
	let pos = 0;
	tx.outputs.forEach((out) => {
		const sc = new bsv.Script.fromBuffer(out._scriptBuffer);
		const sc_len = sc.chunks.length;
		if (sc.chunks[1].opcodenum == 106) {
			if (sc.chunks[2].buf.toString() == bitId_Protocol) {
				const pk = bsv.PublicKey.fromString(
					sc.chunks[3].buf.toString()
				);
				const sig = bsv.crypto.Signature.fromString(
					sc.chunks[4].buf.toString()
				);
				ret.push({ publicKey: pk, sig: sig, pos:pos });
			}
		}
		pos++;
	});
	return ret;
}
var genData2sign = function(tx) {
	checklib();

	let data2sign = "";
	//log(tx);
	tx.inputs.forEach((inp) => {
		data2sign += inp.prevTxId.toString("hex") + inp.outputIndex;
	});
	tx.outputs.forEach((out) => {
		const sc = new bsv.Script.fromBuffer(out._scriptBuffer);
		const sc_len = sc.chunks.length;
		if (sc.chunks[1].opcodenum == 106) {
			if (sc.chunks[2].buf.toString() == bitId_Protocol) {
				log(
					"found bitID. PublicKey=" + sc.chunks[3].buf.toString()
				);
				data2sign += sc.chunks[3].buf.toString() + out._satoshis ; //public key
			} else {
				data2sign += sc.toHex() + out._satoshis;;
			}
		} else {
			data2sign += sc.toHex() + out._satoshis;
		}
	});
	log("data2sign=" + data2sign);
	return data2sign;
}
function littleEndian(strHex){
  if(strHex.length%2!==0){
    strHex = "0"+strHex;
  }
  let strRet="";
  for (let c = strHex.length-2; c >= 0; c -= 2){
    let by = strHex.substr(c, 2);
    log(by);
    strRet+=by;
}
  return strRet;
}

var genScriptFromBitbus = function(out) {
	checklib();

  //TODO: figure out how to gen script without workaround;
  let data = "";
  for (var i = 0; i < out.len; i++) {
    if (out["s" + i]) {
      let opcodenum = 0; 
      const len = bsv.deps.Buffer.from(out["b" + i], 'base64').length;
      

      if (len >= 0 && len < bsv.Opcode.OP_PUSHDATA1) {
        opcodenum = 0;
      } else if (len < Math.pow(2, 8)) {
        opcodenum = bsv.Opcode.OP_PUSHDATA1;
      } else if (len < Math.pow(2, 16)) {
        opcodenum = bsv.Opcode.OP_PUSHDATA2;
      } else if (len < Math.pow(2, 32)) {
        opcodenum = bsv.Opcode.OP_PUSHDATA4;
      } else {
        throw new Error("You can't push that much data");
      }

      if (opcodenum) {
        opcodenum = opcodenum.toString(16);
        data += opcodenum;
      }
      let hex = len.toString(16);
      //if (hex.length < 2) hex = "0" + hex;
      hex = littleEndian(hex);

      data += hex + out["h" + i];
    } else if (out["o" + i]) {
      let hex = bsv.Opcode.fromString(out["o" + i]).toHex();
      if (hex.length < 2) hex = "0" + hex;
      data += hex;
    }
  }
  return data;
}

var genData2signFromBitbus = function(bitbusRtx) {
	checklib();

  let data2sign = "";
  bitbusRtx.in.forEach((inp) => {
    data2sign += inp.e.h + inp.e.i;
  });
  bitbusRtx.out.forEach((out) => {
    if (out.o1 && out.o1 == "OP_RETURN") {
      if (out.s2 && out.s2 == bitId_Protocol) {
        log("found bitID. PublicKey=" + out.s3);
        data2sign += out.s3 + out.e.v; //public key
      } else {
        // data2sign += sc.toHex();
        data2sign += genScriptFromBitbus(out) + out.e.v;
      }
    } else {
      // data2sign += sc.toHex() + out._satoshis;
      data2sign += genScriptFromBitbus(out) + out.e.v;
    }
  });

  log("bitbus data2sign=" + data2sign);
  return data2sign;
}

var getBitIDFromBitbus = function(bitbusRtx) {
	checklib();

		let ret = [];
		let pos = 0;
		bitbusRtx.out.forEach((out) => {
			if (out.o1 == "OP_RETURN" && out.s2 == bitId_Protocol) {
				const pk = filepay.bsv.PublicKey.fromString(out.s3);
				const sig = filepay.bsv.crypto.Signature.fromString(out.s4);
				ret.push({ publicKey: pk, sig: sig,pos:pos });
			}
			pos++;
		});
		return ret;
	}

var verifyIDFromBitbus = function(bitbusRtx) {
	checklib();

		//log(JSON.stringify(bitbusRtx));
		const data2sign = genData2signFromBitbus(bitbusRtx);
		const bids = getBitIDFromBitbus(bitbusRtx);
		log(bids);
		let hash = null;
		if (isBrowser() == false) {
			hash = filepay.bsv.crypto.Hash.sha256(bsv.deps.Buffer.from(data2sign));
		} else {
			hash = filepay.bsv.crypto.Hash.sha256(bsv.deps.Buffer.from(data2sign));
		}
		if (bids && bids.length > 0) {
			for(let i = 0; i < bids.length; i++) {
				let bid = bids[i];
				var verified = filepay.bsv.crypto.ECDSA.verify(hash, bid.sig, bid.publicKey);
				if (!verified) return false;
			}
			return true;
		}
		// bids.forEach((bid) => {
		// 	var verified = filepay.bsv.crypto.ECDSA.verify(hash, bid.sig, bid.publicKey);
		// 	if (!verified) return false;
		// });
		return false;
	}

module.exports = {
	gentx:gentx,
	verifyID:verifyID,
	getBitID:getBitID,
	genData2sign:genData2sign,
	verifyIDFromBitbus:verifyIDFromBitbus,
	getBitIDFromBitbus:getBitIDFromBitbus,
	genData2signFromBitbus:genData2signFromBitbus,
	genScriptFromBitbus:genScriptFromBitbus,
	config:config

};
