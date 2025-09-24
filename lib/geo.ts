
export function haversineDistance(a:{lat:number,lng:number}, b:{lat:number,lng:number}){
  const toRad=(d:number)=>d*Math.PI/180;
  const R=6371; // km
  const dLat=toRad(b.lat-a.lat);
  const dLng=toRad(b.lng-a.lng);
  const lat1=toRad(a.lat); const lat2=toRad(b.lat);
  const sinDLat=Math.sin(dLat/2), sinDLng=Math.sin(dLng/2);
  const h=sinDLat*sinDLat + Math.cos(lat1)*Math.cos(lat2)*sinDLng*sinDLng;
  return 2*R*Math.asin(Math.sqrt(h));
}
