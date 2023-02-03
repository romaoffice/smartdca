var BB = require('technicalindicators').BollingerBands
let settings = require('./settings.json');
const config = require('./config.json');
const fs = require('fs')
const {
  getBinanceClient,
  getPrice,
  initMarket,
  roundStep,
  getExchangeInfo,
  getBalance ,
  getPosition,
  trade
} = require('./utils.js');

let buyamount_option="by percent",buyamount=40,token="AVAX",marketplace="USDT";
let bband_period=20,bband_multi=1.5;
let maxgrid =5,takeprofit=0.8,nextdca=0.8,dca=0,stoploss=10;
let dcalevel=0;
let lastentry=0;
let firstbuyamount =0;
let timeframe='1m';
let symbol="AVAXUSDT";
let precision;
let candles=[];
let lastBB = {};

const checkBB = ()=>{
  return lastBB.close>0 && lastBB.close<lastBB.lower;
}
const updateBB = ()=>{
    let values = candles.map((line)=>Number(line.close));
    var input = {
      period : bband_period, 
      values : values,
      stdDev : bband_multi
    }
    const rt = BB.calculate(input);
    lastBB = {close:values[values.length-1],middle:rt[rt.length-1].middle, upper:rt[rt.length-1].upper,lower:rt[rt.length-1].lower};
}
const getCandles = async()=>{

    const client = getBinanceClient(config.apikey,config.secret);

    candles = await client.futuresCandles({ symbol,interval:timeframe,limit:bband_period+1});
    candles.pop();
    updateBB();
    
    client.ws.futuresCandles(symbol,timeframe,(candle) => {
      if(candle.isFinal){
        candles.push({
            openTime: candle.openTime,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume,
            closeTime: candle.closeTime,
        })
        updateBB();
        console.log(lastBB);
      }
    });    
}
const add_log = async (log, iserror = false, otherDetails = {}) => {
  console.log(log);
  if(iserror){
    settings.lasterror = log+JSON.stringify(otherDetails);
    await updateSettings();
    process.exit();
  }

};

const smartDcaBot = async()=>{
  
  buyamount_option=settings.buyamount_option;
  buyamount=settings.buyamount;
  token=settings.tokenlist[0].token;
  marketplace = settings.marketplace;
  maxgrid=settings.maxgrid;
  takeprofit=settings.takeprofit;
  nextdca=settings.nextdca;
  dca=settings.dca?settings.dca:0;
  stoploss=settings.stoploss;
  timeframe = settings.timeframe;
  dcalevel = settings.dcalevel;
  symbol = token+marketplace;
  lastentry = settings.lastentry;
  firstbuyamount = settings.firstbuyamount;

  await initMarket(symbol);
  precision =getExchangeInfo();
  await updateSettings();
  await getCandles();
  console.log("Initialized",settings);
  monitorOrders();
  return "";
}

const updateSettings=()=>{
  fs.writeFileSync('settings.json', JSON.stringify(settings));
}



const closeAllOrders = async () => {
  const position = await getPosition(symbol)
  if (position.positionAmt>0) {
    const order = await trade(symbol,"SELL",position.positionAmt);
    if(order.message){
      add_log("Failed to close position",true,order.message);
      return false;
    }else{
      console.log("Closed position");
    }
  }
  return true;
};

const monitorOrders = async()=>{

  try{
      if(settings.status=="stop") {
        console.log("Terminated");
        return;
      }


      let position = await getPosition(symbol)      
      const current_price = Number(position.markPrice);
      
      let mustAdd = false;
      let mustClose = false;
      let reason = "";
      console.log('amount',Number(position.positionAmt));
      if(Number(position.positionAmt)==0){
        
        const rt = checkBB();
        if(true || rt) {
          mustAdd = true;
          const balance = Number(await getBalance());
          firstbuyamount = (balance * buyamount) / 100;
          if (buyamount_option) {
            if (buyamount_option == "usdvalue") {
              firstbuyamount = buyamount;
            }
            if (buyamount_option == "tokenvalue") {
              firstbuyamount = buyamount * current_price;
            }
          }
          dcalevel = 0;
          settings.dcalevel=0;
          settings.firstbuyamount = firstbuyamount;
        }
      }else{
        const entry_price = Number(position.entryPrice);
        console.log(lastentry*(1-nextdca/100),entry_price*(1-stoploss/100))
        if(dcalevel<maxgrid && current_price<lastentry*(1-nextdca/100)){

          const rt = checkBB();
          if(rt) mustAdd = true;
        }
        if(current_price<entry_price*(1-stoploss/100)){
          mustClose = true;
          reason = "stoploss";
        }
        console.log(current_price,entry_price*(1+takeprofit/100),current_price>entry_price*(1+takeprofit/100));
        if(current_price>entry_price*(1+takeprofit/100)){
          mustClose = true;
          reason = "takeprofit";
          console.log('Closing')
        }
      }

      if(mustClose){

        const rt = await closeAllOrders();
        if(rt==false) return;


      }else if(mustAdd){
        
        let cost = Number(roundStep((dcalevel+1)*firstbuyamount / current_price, precision.amount));
        console.log('buy',cost)
        const order = await trade(symbol,"BUY",cost);
        if (order.message) {
          add_log('Failed to place  order',true,{message:order.message})
          return;
        }

        add_log("Buy order placed. ",false, {
          price: current_price,
          quantity: cost,
          orderId: order.id,
        });

        dcalevel = dcalevel +1;
        settings.dcalevel = dcalevel;
        lastentry = current_price;
        settings.lastentry = lastentry;
      }
      if(mustClose || mustAdd) {
        await updateSettings();
        if(mustClose) {
          if(reason=='stoploss') return;
        }
      }
      setTimeout(monitorOrders, 2000);

  }catch(e){
    console.log(e);
    await add_log(e.message.slice(0, 50),true, {error: e.message});
  }
}

module.exports={smartDcaBot}