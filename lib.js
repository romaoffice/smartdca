const getEnvVar = (maxgrid=5,nextdca=0.8,totalloss=30,maxdd=20)=>{
	
	const leverage = totalloss / maxdd ;

	const totalbuy_rate = (1+maxgrid)*maxgrid/2 ;
	const firstamount_percent = (totalloss / maxdd)/totalbuy_rate * 100;
	const stoploss = maxdd - maxgrid * nextdca;

	return {firstamount_percent,stoploss,leverage};
}

module.exports = {
	getEnvVar
}

const main = ()=>{
	console.log(getEnvVar(5,0.8,90,15));
}

main();