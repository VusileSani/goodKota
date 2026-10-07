// Pilot storage: transactions make role claims and order mutations durable across
// Cloud Run instances. The single operational document must be partitioned
// before launch; its size limit deliberately stops growth in this pilot.
const emptyRoles = () => ({merchants:{},invites:[]});
const maxStateBytes = 700_000;
const maxRoleBytes = 200_000;
const asJson = value => JSON.parse(JSON.stringify(value));
const checkSize = (value,max) => {
  if (Buffer.byteLength(JSON.stringify(value),"utf8") > max) throw new Error("Pilot storage is full. Contact GoodKota support.");
};

export function createFirestoreStorage(firestore) {
  if (!firestore?.collection || !firestore?.runTransaction) throw new Error("Firestore is required for cloud storage.");
  const stateRef = firestore.collection("goodkota_pilot_private").doc("operations");
  const roleRef = firestore.collection("goodkota_pilot_private").doc("roles");
  return {
    state: {
      read: async () => (await stateRef.get()).data()?.state || null,
      update: operation => firestore.runTransaction(async transaction => {
        const current = (await transaction.get(stateRef)).data()?.state || null;
        const {state,result} = await operation(current);
        const stored = asJson(state);
        checkSize(stored,maxStateBytes);
        transaction.set(stateRef,{state:stored});
        return result;
      })
    },
    roles: {
      read: async () => (await roleRef.get()).data()?.roles || emptyRoles(),
      update: operation => firestore.runTransaction(async transaction => {
        const roles = (await transaction.get(roleRef)).data()?.roles || emptyRoles();
        const result = await operation(roles);
        const stored = asJson(roles);
        checkSize(stored,maxRoleBytes);
        transaction.set(roleRef,{roles:stored});
        return result;
      })
    }
  };
}
