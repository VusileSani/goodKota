const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";
export function encodeGeohash(latitude, longitude, precision = 7) {
  let minLat=-90,maxLat=90,minLng=-180,maxLng=180, hash="", bits=0, value=0, even=true;
  while (hash.length < precision) {
    if (even) { const mid=(minLng+maxLng)/2; if (longitude>=mid) { value=(value<<1)+1; minLng=mid; } else { value<<=1; maxLng=mid; } }
    else { const mid=(minLat+maxLat)/2; if (latitude>=mid) { value=(value<<1)+1; minLat=mid; } else { value<<=1; maxLat=mid; } }
    even=!even; bits+=1;
    if (bits===5) { hash+=BASE32[value]; bits=0; value=0; }
  }
  return hash;
}
