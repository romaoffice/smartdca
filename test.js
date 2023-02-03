const Binance = require("binance-api-node").default;
const {apikey,secret} = require("./config.json")

let globalPrice={};

function getBinanceClient(_apikey,_secret){

	let binanceParams = {
	    apiKey:_apikey,
	    apiSecret:_secret,
	    recvWindow: 10000,
	}

	binanceParams.httpFutures = "https://fapi.apollox.finance";
	binanceParams.wsBase = "wss://fstream.apollox.finance";
	const client = Binance( binanceParams);	
	return client;
}

function getPrice(symbol){
	return (globalPrice[symbol]);
}

async function initMarket(){
	const client = getBinanceClient(apikey,secret);
    console.log("Init ws");
    client.ws.futuresCandles("BNBUSDT","1m",(tickers) => {
    	console.log(tickers)
  	});

}
async function main(){

	initMarket()
}

main();
module.exports = {
	getPrice,
	initMarket
}