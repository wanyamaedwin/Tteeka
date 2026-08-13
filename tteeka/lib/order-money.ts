export function formatOrderMoney(amount:string,currency:string|null){
  if(currency===null)return amount==='0'?'0':amount
  try{return `${currency} ${BigInt(amount).toLocaleString('en-UG')}`}catch{return `${currency} ${amount}`}
}
export function multiplyMoney(amount:string,quantity:string){return (BigInt(amount)*BigInt(quantity)).toString()}
export function sumMoney(values:string[]){return values.reduce((total,value)=>total+BigInt(value),BigInt(0)).toString()}
export function validateQuantity(value:string){
  const clean=value.trim()
  if(!/^\d+$/.test(clean))return 'Enter a positive whole number.'
  try{if(BigInt(clean)<=BigInt(0)||BigInt(clean)>BigInt('9223372036854775807'))return 'Enter a positive whole number.'}catch{return 'Enter a positive whole number.'}
  return null
}
