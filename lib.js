const getFirstAmount = (maxgrid,nextdca,maxdd,stoploss,balance)=>{
	
	const leverage = (maxdd-stoploss)/(maxgrid * nextdca);
	const totallevel = (1+maxgrid)*maxgrid/2;
	const amount =(balance *  leverage /totallevel).toFixed(2);

	return amount;
}

module.exports = {
	getFirstAmount
}