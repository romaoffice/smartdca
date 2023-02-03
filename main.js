var BB = require('technicalindicators').BollingerBands
let settings = require('./settings.json');
const Binance = require("binance-api-node").default;

let buyamount_option="usdvalue",buyamount=30,token="AVAX",marketplace="USDT";
let bband_period=20,bband_multi=1.5;
let maxgrid =5,takeprofit=0.8,nextdca=0.8,dca=0,stoploss=10;
let dcalevel=0;
let lastentry=0;
let firstbuyamount =0;
let timeframe='5m';
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

    let binanceParams = {
        recvWindow: 50000
    }

    binanceParams.httpBase = `http://${endpoint}`;
    binanceParams.wsBase = `ws://${endpoint}:2083`;

    const client = Binance( binanceParams);

    candles = await client.candles({ symbol,interval:timeframe,limit:bband_period+1});
    candles.pop();
    updateBB();
    
    client.ws.candles(symbol,timeframe,(candle) => {
      if(candle.isFinal){
        candles.push({
            openTime: candle.openTime,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume,
            closeTime: candle.closeTime,
            quoteAssetVolume: candle.quoteAssetVolume,
            trades: candle.trades,
            baseAssetVolume: candle.baseAssetVolume,
        })
        updateBB();
      }
    });    
}
const add_log = async (log, iserror = false, otherDetails = {}) => {
  console.log(log);
  if(iserror){
    settings.status='stop';
    settings.lasterror = log+JSON.stringify(otherDetails);
    await updateSettings();
  }

};

const smartDcaBot = async(_userId,_exchangeId,_strategyId)=>{
  
  settings = JSON.parse(strategy.settings);

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
  precision = updater.getPrecision(symbol, false);
  const rtBalance = checkEnoughBalanceSmart(settings,exchangeId,userId)  
  if(rtBalance==false) {
    add_log("Not enough balance",true);
  }
  await updateSettings();
  await getCandles();
  monitorOrders();
  return "";
}

const updateSettings=()=>{
  fs.writeFileSync('settings.json', JSON.stringify(settings));
}



const closeAllOrders = async () => {
  const position = await posMan.getPosition(
    userId,
    strategyId,
    token,
    "Open"
  );
  if (position) {
    const tokenbalance = roundStep(Number(position.entry_qty)-Number(position.exit_qty),precision.amount);
    if (Number(tokenbalance) > 0) {
      const rt = await posMan.orderSendSell(
        0,
        exchangeId,
        userId,
        strategyId,
        tokenbalance,
        token,
        marketplace
      );
      if(rt.message){
        add_log("Failed to close position",true,rt.message);
        return false;
      }else{
        console.log("Closed position");
      }
    }
  }
  return true;
};

const monitorOrders = async()=>{

  try{
      let position = await posMan.getPosition(userId, strategyId, token, "All");
      if (settings.status == "stop") {
        return;
      }
      let positionClosed = false;
      if (position) {
        positionClosed = position.deal_status == "Closed";
      }
      
      const current_price = updater.getPrice(symbol);

      let mustAdd = false;
      let mustClose = false;
      let reason = "";
      if(!position || position.entry_qty==0 || positionClosed){
        
        const rt = checkBB();
        if(rt) {
          mustAdd = true;
          const balance = await posMan.getBalance(
            userId,
            marketplace,
            exchangeId,
            strategyId
          );
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
        if(dcalevel<maxgrid && current_price<lastentry*(1-nextdca/100)){

          const rt = checkBB();
          if(rt) mustAdd = true;
        }
        if(current_price<position.avg_entry_price*(1-stoploss/100)){
          mustClose = true;
          reason = "Stoploss";
        }
        if(current_price>position.avg_entry_price*(1+takeprofit/100)){
          mustClose = true;
          reason = "takeprofit";
          console.log('Closing')
        }
      }
      if(mustClose){

        const rt = await closeAllOrders();
        if(rt==false) return;


      }else if(mustAdd){
        
        const cost = Number(roundStep((dcalevel+1)*firstbuyamount / current_price, precision.amount));
        console.log('buy',cost)
        order = await posMan.orderSendBuy(
          dcalevel,
          exchangeId,
          userId,
          strategyId,
          cost,
          token,
          marketplace
        );
        if (order.message) {
          add_log('Failed to place  order',true,{message:order.message})
          return;
        }

        add_log("Buy order placed. ",false, {
          price: current_price,
          quantity: cost,
          orderId: order.id,
        });
        if(dcalevel==0){
          position = await posMan.getPosition(
              userId,
              strategyId,
              token,
              "Open"
          );
          const totalInvested= await getTotalInvestedSmartDca(settings,exchangeId,userId);
          await position.update({totalInvested});          
        }

        dcalevel = dcalevel +1;
        settings.dcalevel = dcalevel;
        lastentry = current_price;
        settings.lastentry = lastentry;
      }
      if(mustClose || mustAdd) {
        if(mustClose) await position.update({status:reason});  
        await updateSettings();
      }
      setTimeout(monitorOrders, 2000);

  }catch(e){
    console.log(e);
    await add_log(e.message.slice(0, 50),true, {error: e.message});
  }
}

module.exports={smartDcaBot}