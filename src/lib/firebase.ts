import { supabase } from './supabase';
import { toCamelBooking, toSnakeBooking, toCamelDriver, toSnakeDriver } from './db';

// Supabase-backed compatibility layer for Admin Dashboard
export const auth: any = {
  currentUser: { uid: 'admin-master', email: 'alisoban1990@gmail.com' }
};

export async function signInAnonymously(_auth?: any) {
  return { user: auth.currentUser };
}

export async function setPersistence(_auth: any, _persistence: any) {
  return true;
}

export const browserLocalPersistence = {};

export function onAuthStateChanged(_auth: any, next: (user: any) => void, _error?: any) {
  next(auth.currentUser);
  return () => {};
}

export async function signOut(_auth: any) {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('easyride_admin_token');
  }
}

export interface DocRef {
  table: string;
  id: string;
}

export interface CollectionRef {
  table: string;
}

export const db: any = supabase;

export function doc(_db: any, table: string, id: string): DocRef {
  return { table, id };
}

export function collection(_db: any, table: string): CollectionRef {
  return { table };
}

export function query(col: CollectionRef, ..._args: any[]): CollectionRef {
  return col;
}

export function orderBy(_field: string, _dir?: string) {
  return {};
}

export function where(_field: string, _op: string, _value: any) {
  return {};
}

export const Timestamp = {
  now: () => ({ seconds: Math.floor(Date.now() / 1000) }),
  fromDate: (d: Date) => ({ seconds: Math.floor(d.getTime() / 1000) }),
};

export async function setDoc(docRef: DocRef, data: any, options?: { merge?: boolean }) {
  const table = docRef.table;
  let record: any;
  if (table === 'bookings') {
    record = toSnakeBooking({ id: docRef.id, bookingId: docRef.id, ...data });
    const { error } = await supabase.from('bookings').upsert(record);
    if (error) throw new Error(error.message);
  } else if (table === 'drivers') {
    record = toSnakeDriver({ id: docRef.id, ...data });
    const { error } = await supabase.from('drivers').upsert(record);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from(table).upsert({ id: docRef.id, ...data });
    if (error) throw new Error(error.message);
  }
  return true;
}

export async function updateDoc(docRef: DocRef, data: any) {
  const table = docRef.table;
  let record: any;
  if (table === 'bookings') {
    record = toSnakeBooking(data);
    delete record.id;
    delete record.booking_id;
    const { error } = await supabase
      .from('bookings')
      .update(record)
      .or(`id.eq.${docRef.id},booking_id.eq.${docRef.id}`);
    if (error) throw new Error(error.message);
  } else if (table === 'drivers') {
    record = toSnakeDriver(data);
    delete record.id;
    const { error } = await supabase
      .from('drivers')
      .update(record)
      .or(`id.eq.${docRef.id},driver_id.eq.${docRef.id}`);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from(table).update(data).eq('id', docRef.id);
    if (error) throw new Error(error.message);
  }
  return true;
}

export async function getDocs(queryRef: CollectionRef | DocRef) {
  const table = queryRef.table;
  const { data, error } = await supabase.from(table).select('*');
  if (error) throw new Error(error.message);

  const docs = (data || []).map((row: any) => {
    let parsed = row;
    if (table === 'bookings') parsed = toCamelBooking(row);
    if (table === 'drivers') parsed = toCamelDriver(row);
    return {
      id: parsed.id || parsed.bookingId || row.id,
      data: () => parsed,
      ...parsed,
    };
  });

  return { docs, size: docs.length, empty: docs.length === 0 };
}

export function onSnapshot(
  queryRef: CollectionRef,
  next: (snapshot: { docs: any[]; docChanges: () => any[] }) => void,
  errorCb?: (error: any) => void
) {
  const table = queryRef.table;
  let active = true;

  const loadData = async (isInitial = false) => {
    try {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        if (errorCb) errorCb(error);
        return;
      }

      if (!active) return;

      const docs = (data || []).map((row: any) => {
        let parsed = row;
        if (table === 'bookings') parsed = toCamelBooking(row);
        if (table === 'drivers') parsed = toCamelDriver(row);
        return {
          id: parsed.id || parsed.bookingId || row.id,
          data: () => parsed,
          ...parsed,
        };
      });

      next({
        docs,
        docChanges: () => []
      });
    } catch (err: any) {
      if (errorCb) errorCb(err);
    }
  };

  // Initial load
  loadData(true);

  // Realtime subscription via Supabase Channel
  const channel = supabase
    .channel(`realtime:${table}`)
    .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
      loadData(false);
    })
    .subscribe();

  return () => {
    active = false;
    supabase.removeChannel(channel);
  };
}

export default supabase;
