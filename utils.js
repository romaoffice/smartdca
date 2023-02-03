const Binance = require("binance-api-node").default;
const {apikey,secret} = require("./config.json")

let globalPrice;
let exchangeInfo={};

Number.prototype.noExponents = function() {
	var data = String(this).split(/[eE]/);
	if (data.length == 1) return data[0];
  
	var z = '',
	  sign = this < 0 ? '-' : '',
	  str = data[0].replace('.', ''),
	  mag = Number(data[1]) + 1;
  
	if (mag < 0) {
	  z = sign + '0.';
	  while (mag++) z += '0';
	  return z + str.replace(/^\-/, '');
	}
	mag -= str.length;
	while (mag--) z += '0';
	return str + z;
}

function roundStep(qty, stepSize){
	
	stepSize = stepSize.noExponents();
	const sp = stepSize.toString().split('.');
	if(sp.length==1) return(Math.floor(qty)); 
    const precision = sp[1].length || 0;
    return ((Math.floor((qty*Math.pow(10,precision)) / (stepSize*Math.pow(10,precision))) | 0) * stepSize).toFixed(precision);
}

function getBinanceClient(_apikey,_secret){

	let binanceParams = {
	    apiKey:_apikey,
	    apiSecret:_secret,
	    recvWindow: 50000,
	    useServerTime:true
	}

	binanceParams.httpFutures = "https://fapi.apollox.finance";
	binanceParams.wsBase = "wss://fstream.apollox.finance";
	const client = Binance( binanceParams);
	return client;
}

function getPrice(){
	return globalPrice;
}
function getExchangeInfo(){
	return exchangeInfo;
}
async function initMarket(symbol){

	const client = getBinanceClient(apikey,secret);
	const markets = await client.futuresExchangeInfo();

	await markets.symbols.map(async (symbolinfo) => {
        let price ;
        let amount ;
        if(symbolinfo.symbol==symbol){
        	
            symbolinfo.filters.map((filter)=>{
	          if(filter.filterType=="PRICE_FILTER") price = Number(filter.tickSize);
	          if(filter.filterType=="LOT_SIZE") amount = Number(filter.stepSize);
	        })
	        exchangeInfo.price = price;
	        exchangeInfo.amount = amount;
        }

    });
    console.log(exchangeInfo);
    client.ws.futuresCustomSubStream([`${symbol.toLowerCase()}@markPrice`], (data)=>{
    	globalPrice= data.P;
    })

    client.ws.futuresCustomSubStream([`${symbol.toLowerCase()}@markPrice`], (data)=>{
    	globalPrice= data.P;
    })
	
}
async function getBalance(asset='USDT'){
	const client = getBinanceClient(apikey,secret);
	const balance_list = await client.futuresAccountBalance();
	let balance = 0;
	balance_list.map((info)=>{
		if(info.asset.toLowerCase()==asset.toLowerCase()){
			balance = info.availableBalance;
		}
	})
	return (balance);
}
async function getPosition(symbol){
	const client = getBinanceClient(apikey,secret);
	const position_list = await client.futuresPositionRisk();
	let position;
	position_list.map((info)=>{
		if(info.symbol.toLowerCase()==symbol.toLowerCase()){
			position = info;
		}
	})
	return (position);

}
async function trade(symbol,side,quantity){
	try{
		const client = getBinanceClient(apikey,secret);
	    const order = await client.futuresOrder({
	      symbol,
	      side,
	      type:"MARKET",
	      quantity
	    })
	    return(order);

	}catch(e){
		return {message:e.message};
	}
}
async function main(){

	// console.log(await trade("AVAXUSDT","BUY",1.1))
	console.log(await getPosition("AVAXUSDT"));

}

main();
module.exports = {
	getBinanceClient,
	getPrice,
	initMarket,
	roundStep,
	getExchangeInfo,
	getBalance,
	getPosition,
	trade
}