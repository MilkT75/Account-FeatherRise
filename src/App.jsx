import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { 
  getFirestore, collection, onSnapshot, addDoc, 
  deleteDoc, doc, updateDoc, serverTimestamp, writeBatch 
} from 'firebase/firestore';
import { 
  PlusCircle, MinusCircle, Wallet, Trash2, Edit2, 
  X, Check, Filter, Users, UserPlus, Banknote, Settings 
} from 'lucide-react';

// ==========================================
// 1. Firebase Config
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyAZyh-2I-_86i8JAh-BAfy__skTXTAZOeA",
  authDomain: "inventory-new-featherrise.firebaseapp.com",
  projectId: "inventory-new-featherrise",
  storageBucket: "inventory-new-featherrise.firebasestorage.app",
  messagingSenderId: "519862097911",
  appId: "1:519862097911:web:7e4c791dd1694e495200f2"
};

let app, db, auth;
try {
  const configToUse = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : firebaseConfig;
  if (Object.keys(configToUse).length > 0) {
      app = initializeApp(configToUse);
      db = getFirestore(app);
      auth = getAuth(app);
  }
} catch (error) {
  console.error("Firebase init error:", error);
}

// ==========================================
// 2. Google Sheet Webhook URL
// ==========================================
const GOOGLE_SHEET_WEBHOOK_URL = "";

// ==========================================
// 3. Main Component
// ==========================================
export default function App() {
  const [user, setUser] = useState(null);
  const [records, setRecords] = useState([]);
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Form State (Main Accounting)
  const [formData, setFormData] = useState({
    type: 'income', amount: '', category: '',
    date: new Date().toISOString().split('T')[0], note: ''
  });
  
  // Edit & Filter State
  const [editingId, setEditingId] = useState(null);
  const [filterMonth, setFilterMonth] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  // Partner Modal State
  const [partnerModal, setPartnerModal] = useState({ isOpen: false, mode: '', data: null, value: '' });

  // Categories
  const categories = {
    income: ['ขายสินค้า', 'เงินปันผล', 'รายรับอื่นๆ'],
    expense: ['ค่าแรง', 'ค่าวัตถุดิบ', 'ค่าเช่าที่', 'การตลาด', 'รายจ่ายอื่นๆ']
  };

  // ==========================================
  // 4. Effects & Auth
  // ==========================================
  useEffect(() => {
    if (!auth) { setLoading(false); return; }
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          import('firebase/auth').then(({ signInWithCustomToken }) => {
              signInWithCustomToken(auth, __initial_auth_token).catch(e => console.error(e));
          });
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) { console.error("Auth Error:", error); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if(!currentUser) setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !db) return;

    // ดึงข้อมูลบัญชี
    const recordsRef = collection(db, 'accounting_records');
    const unsubRecords = onSnapshot(recordsRef, (snapshot) => {
      const data = [];
      snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() }));
      data.sort((a, b) => {
          const dateDiff = new Date(b.date) - new Date(a.date);
          if (dateDiff !== 0) return dateDiff;
          const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
          const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
          return timeB - timeA;
      });
      setRecords(data);
    });

    // ดึงข้อมูลพาร์ทเนอร์/พนักงาน
    const partnersRef = collection(db, 'accounting_partners');
    const unsubPartners = onSnapshot(partnersRef, (snapshot) => {
      const pData = [];
      snapshot.forEach(doc => pData.push({ id: doc.id, ...doc.data() }));
      // เรียงตามเวลาสร้าง
      pData.sort((a, b) => {
          const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
          const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
          return timeA - timeB;
      });
      setPartners(pData);
      setLoading(false);
    });

    return () => { unsubRecords(); unsubPartners(); };
  }, [user]);

  // ==========================================
  // 5. Helper Functions
  // ==========================================
  const sendWebhook = (action, data) => {
    if (!GOOGLE_SHEET_WEBHOOK_URL) return;
    fetch(GOOGLE_SHEET_WEBHOOK_URL, {
      method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...data, timestamp: new Date().toISOString() })
    }).catch(err => console.error('Webhook error:', err));
  };

  const logAction = async (action, data) => {
    if (!db) return;
    try {
      await addDoc(collection(db, 'accounting_logs'), { action, data, timestamp: serverTimestamp() });
      sendWebhook(action, data);
    } catch (e) { console.error("Log error:", e); }
  };

  // ==========================================
  // 6. Accounting Handlers
  // ==========================================
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const newData = { ...prev, [name]: value };
      if (name === 'type') newData.category = '';
      return newData;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user || !db) { alert('กำลังเชื่อมต่อฐานข้อมูล'); return; }
    if (!formData.amount || Number(formData.amount) <= 0) { alert('ระบุจำนวนเงินให้ถูกต้อง'); return; }
    if (!formData.category) { alert('กรุณาเลือกหมวดหมู่'); return; }
    if (!formData.date) { alert('กรุณาระบุวันที่'); return; }

    const payload = { ...formData, amount: Number(formData.amount), updatedAt: serverTimestamp() };

    try {
      if (editingId) {
        await updateDoc(doc(db, 'accounting_records', editingId), payload);
        await logAction('UPDATE', { id: editingId, ...payload });
        setEditingId(null);
      } else {
        payload.createdAt = serverTimestamp();
        const docRef = await addDoc(collection(db, 'accounting_records'), payload);
        await logAction('CREATE', { id: docRef.id, ...payload });
      }
      setFormData({ type: formData.type, amount: '', category: '', date: new Date().toISOString().split('T')[0], note: '' });
    } catch (err) { alert("เกิดข้อผิดพลาด: " + err.message); }
  };

  const handleEdit = (record) => {
    setEditingId(record.id);
    setFormData({ type: record.type, amount: record.amount.toString(), category: record.category, date: record.date, note: record.note || '' });
    const formElement = document.getElementById('record-form');
    if (formElement) formElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleDelete = async (id, recordData) => {
    if (!user || !db) return;
    if (!window.confirm("ต้องการลบรายการนี้ใช่หรือไม่?")) return;
    try {
      await deleteDoc(doc(db, 'accounting_records', id));
      await logAction('DELETE', { id, ...recordData });
    } catch (err) { alert("เกิดข้อผิดพลาด: " + err.message); }
  };

  // ==========================================
  // 7. Partner / Wage Handlers
  // ==========================================
  const handlePartnerSubmit = async (e) => {
    e.preventDefault();
    if (!user || !db) return;
    const { mode, data, value } = partnerModal;
    
    try {
        if (mode === 'add') {
            if (!value.trim()) return alert('กรุณาระบุชื่อ');
            await addDoc(collection(db, 'accounting_partners'), {
                name: value.trim(),
                pendingWage: 0, // ยอดตั้งต้น
                createdAt: serverTimestamp()
            });
        } else if (mode === 'setWage') {
            const amount = Number(value);
            if (isNaN(amount) || amount < 0) return alert('จำนวนเงินไม่ถูกต้อง');
            await updateDoc(doc(db, 'accounting_partners', data.id), {
                pendingWage: amount
            });
        }
        setPartnerModal({ isOpen: false, mode: '', data: null, value: '' });
    } catch (err) {
        alert("Error: " + err.message);
    }
  };

  const handlePayWage = async (partner) => {
      if (!user || !db) return;
      if (!partner.pendingWage || partner.pendingWage <= 0) {
          alert(`ไม่มียอดรอจ่ายสำหรับ ${partner.name}`);
          return;
      }
      if (!window.confirm(`ยืนยันการจ่ายค่าแรงให้ ${partner.name} จำนวน ฿${partner.pendingWage.toLocaleString()} ?\n(ระบบจะตัดเงินจากกองกลางและล้างยอดของคนนี้เป็น 0)`)) return;

      try {
          const batch = writeBatch(db);
          
          // 1. สร้างรายการรายจ่ายในบัญชีหลัก
          const recordRef = doc(collection(db, 'accounting_records'));
          const recordPayload = {
              type: 'expense',
              amount: partner.pendingWage,
              category: 'ค่าแรง',
              date: new Date().toISOString().split('T')[0],
              note: `จ่ายค่าแรง: ${partner.name}`,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
          };
          batch.set(recordRef, recordPayload);

          // 2. รีเซ็ตยอดรอจ่ายของพาร์ทเนอร์เป็น 0
          const partnerRef = doc(db, 'accounting_partners', partner.id);
          batch.update(partnerRef, { pendingWage: 0 });

          // 3. Commit
          await batch.commit();

          // 4. Log
          await logAction('CREATE_PAY_WAGE', { id: recordRef.id, ...recordPayload });
          alert(`จ่ายค่าแรงให้ ${partner.name} สำเร็จแล้ว`);
      } catch (err) {
          alert("เกิดข้อผิดพลาด: " + err.message);
      }
  };

  const handleDeletePartner = async (partnerId) => {
      if(!window.confirm("คุณต้องการลบรายชื่อหุ้นส่วนนี้ออกจากระบบใช่หรือไม่? (ประวัติบัญชีจะยังอยู่)")) return;
      await deleteDoc(doc(db, 'accounting_partners', partnerId));
  };

  // ==========================================
  // 8. Render Data Computations
  // ==========================================
  const filteredRecords = records.filter(record => {
    const matchMonth = filterMonth ? record.date.startsWith(filterMonth) : true;
    const matchCategory = filterCategory ? record.category === filterCategory : true;
    return matchMonth && matchCategory;
  });

  const totals = filteredRecords.reduce((acc, curr) => {
    if (curr.type === 'income') acc.income += curr.amount;
    if (curr.type === 'expense') acc.expense += curr.amount;
    return acc;
  }, { income: 0, expense: 0 });
  const balance = totals.income - totals.expense;

  if (loading) return <div className="min-h-screen flex items-center justify-center font-sans text-gray-500 bg-gray-50">กำลังโหลดระบบบัญชี...</div>;

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900 pb-20">
      {/* Header */}
      <div className="bg-blue-600 text-white p-4 shadow-md sticky top-0 z-20">
        <h1 className="text-lg md:text-xl font-bold flex items-center gap-2 max-w-4xl mx-auto">
          <Wallet className="w-6 h-6" /> ระบบบัญชี (Accounting)
        </h1>
      </div>

      <div className="max-w-4xl mx-auto p-3 md:p-6 space-y-4 md:space-y-6">
        
        {/* Dashboard - Responsive Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-green-500 flex sm:flex-col justify-between sm:justify-start items-center sm:items-start">
            <p className="text-sm text-gray-500 font-medium">รายรับรวม</p>
            <p className="text-xl md:text-2xl font-bold text-green-600">฿{totals.income.toLocaleString()}</p>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-red-500 flex sm:flex-col justify-between sm:justify-start items-center sm:items-start">
            <p className="text-sm text-gray-500 font-medium">รายจ่ายรวม</p>
            <p className="text-xl md:text-2xl font-bold text-red-600">฿{totals.expense.toLocaleString()}</p>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-blue-500 flex sm:flex-col justify-between sm:justify-start items-center sm:items-start">
            <p className="text-sm text-gray-500 font-medium">คงเหลือสุทธิ</p>
            <p className="text-xl md:text-2xl font-bold text-blue-600">฿{balance.toLocaleString()}</p>
          </div>
        </div>

        {/* ระบบ Face Card ID หุ้นส่วน / จ่ายค่าแรง */}
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
              <h2 className="text-base md:text-lg font-semibold text-gray-800 flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-500" /> จัดการค่าแรง / หุ้นส่วน
              </h2>
              <button 
                onClick={() => setPartnerModal({ isOpen: true, mode: 'add', data: null, value: '' })}
                className="flex items-center gap-1.5 text-sm bg-blue-50 text-blue-600 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition w-full sm:w-auto justify-center"
              >
                <UserPlus className="w-4 h-4" /> เพิ่มรายชื่อ
              </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {partners.length === 0 ? (
               <div className="col-span-full p-6 text-center text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200">ยังไม่มีรายชื่อ กด "เพิ่มรายชื่อ" ด้านบน</div>
            ) : (
              partners.map((partner) => (
                <div key={partner.id} className="border border-gray-200 rounded-xl p-4 flex flex-col items-center justify-center gap-3 hover:shadow-md transition-shadow bg-white relative group">
                  {/* ปุ่มลบ */}
                  <button 
                     onClick={() => handleDeletePartner(partner.id)} 
                     className="absolute top-2 right-2 text-gray-300 hover:text-red-500 transition-colors p-1"
                     title="ลบรายชื่อนี้"
                  >
                     <X className="w-4 h-4" />
                  </button>

                  <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center shadow-inner mt-2">
                    <Users className="w-6 h-6 text-gray-500" />
                  </div>
                  <div className="text-center w-full">
                      <span className="font-bold text-gray-800 text-sm block truncate">{partner.name}</span>
                      <span className={`text-xs mt-1 block ${partner.pendingWage > 0 ? 'text-orange-500 font-semibold' : 'text-gray-400'}`}>
                         ยอดรอจ่าย: ฿{(partner.pendingWage || 0).toLocaleString()}
                      </span>
                  </div>
                  
                  <div className="w-full flex flex-col gap-2 mt-1">
                      <button 
                        onClick={() => setPartnerModal({ isOpen: true, mode: 'setWage', data: partner, value: partner.pendingWage || '' })}
                        className="flex items-center justify-center gap-1.5 w-full bg-gray-50 text-gray-600 border border-gray-200 py-1.5 rounded-md text-xs font-medium hover:bg-gray-100 transition"
                      >
                        <Settings className="w-3.5 h-3.5" /> ตั้งยอดค่าแรง
                      </button>
                      <button 
                        onClick={() => handlePayWage(partner)}
                        disabled={!partner.pendingWage || partner.pendingWage <= 0}
                        className="flex items-center justify-center gap-1.5 w-full bg-blue-50 text-blue-600 border border-blue-200 py-1.5 rounded-md text-xs font-bold hover:bg-blue-600 hover:text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Banknote className="w-4 h-4" /> จ่ายเงินตัดบัญชี
                      </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Input Form */}
        <div id="record-form" className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-gray-200">
          <h2 className="text-base md:text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            {editingId ? <Edit2 className="w-5 h-5 text-yellow-500" /> : <PlusCircle className="w-5 h-5 text-blue-500" />}
            {editingId ? 'แก้ไขรายการบัญชี' : 'บันทึกรายการบัญชีกองกลาง'}
          </h2>
          
          <form onSubmit={handleSubmit} className="space-y-4 md:space-y-5">
            <div className="grid grid-cols-2 gap-3 md:gap-4">
              <button
                type="button"
                onClick={() => handleInputChange({ target: { name: 'type', value: 'income' } })}
                className={`py-2.5 md:py-3 rounded-lg font-bold flex justify-center items-center gap-2 transition ${formData.type === 'income' ? 'bg-green-500 text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
              >
                <PlusCircle className="w-5 h-5" /> รายรับ
              </button>
              <button
                type="button"
                onClick={() => handleInputChange({ target: { name: 'type', value: 'expense' } })}
                className={`py-2.5 md:py-3 rounded-lg font-bold flex justify-center items-center gap-2 transition ${formData.type === 'expense' ? 'bg-red-500 text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
              >
                <MinusCircle className="w-5 h-5" /> รายจ่าย
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">จำนวนเงิน (บาท)*</label>
                <input 
                  type="number" name="amount" min="0" step="any"
                  value={formData.amount} onChange={handleInputChange}
                  className="w-full p-2.5 md:p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900 shadow-sm"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">หมวดหมู่*</label>
                <select 
                  name="category"
                  value={formData.category} onChange={handleInputChange}
                  className="w-full p-2.5 md:p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900 shadow-sm"
                >
                  <option value="" disabled>-- เลือกหมวดหมู่ --</option>
                  {categories[formData.type].map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">วันที่*</label>
                <input 
                  type="date" name="date"
                  value={formData.date} onChange={handleInputChange}
                  className="w-full p-2.5 md:p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900 shadow-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ</label>
                <input 
                  type="text" name="note"
                  value={formData.note} onChange={handleInputChange}
                  className="w-full p-2.5 md:p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900 shadow-sm"
                  placeholder="ระบุเพิ่มเติม..."
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button 
                type="submit" 
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-bold flex justify-center items-center gap-2 transition shadow-sm"
              >
                <Check className="w-5 h-5" /> {editingId ? 'บันทึกการแก้ไขบัญชี' : 'บันทึกลงบัญชี'}
              </button>
              {editingId && (
                <button 
                  type="button" onClick={cancelEdit}
                  className="py-3 sm:px-6 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-medium flex justify-center items-center transition"
                >
                  ยกเลิกการแก้ไข
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row items-center gap-2 bg-white p-3 md:p-4 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center gap-2 w-full sm:w-auto text-gray-500 font-medium">
             <Filter className="w-5 h-5" /> ตัวกรอง:
          </div>
          <div className="flex gap-2 w-full">
            <input 
              type="month" 
              value={filterMonth} 
              onChange={(e) => setFilterMonth(e.target.value)}
              className="p-2 text-sm border border-gray-300 rounded-md outline-none focus:ring-1 focus:ring-blue-500 w-full bg-white text-gray-900"
            />
            <select 
              value={filterCategory} 
              onChange={(e) => setFilterCategory(e.target.value)}
              className="p-2 text-sm border border-gray-300 rounded-md outline-none focus:ring-1 focus:ring-blue-500 w-full bg-white text-gray-900"
            >
              <option value="">ทุกหมวดหมู่</option>
              {[...categories.income, ...categories.expense].map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Transaction History List */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
            <h3 className="font-semibold text-gray-700">ประวัติบัญชีกองกลาง</h3>
            <span className="text-xs font-bold text-gray-600 bg-white px-3 py-1 rounded-full border border-gray-200 shadow-sm">{filteredRecords.length} รายการ</span>
          </div>
          
          <div className="divide-y divide-gray-100 max-h-[60vh] overflow-y-auto bg-white">
            {filteredRecords.length === 0 ? (
              <p className="text-center py-8 text-gray-400 text-sm">ไม่พบประวัติรายการบัญชี</p>
            ) : (
              filteredRecords.map((record) => (
                <div key={record.id} className="p-4 hover:bg-blue-50 flex items-center justify-between transition-colors">
                  <div className="flex items-start md:items-center gap-3 overflow-hidden pr-2">
                    <div className={`p-2 rounded-full shrink-0 mt-0.5 md:mt-0 ${record.type === 'income' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                      {record.type === 'income' ? <PlusCircle className="w-5 h-5" /> : <MinusCircle className="w-5 h-5" />}
                    </div>
                    <div className="overflow-hidden">
                      <p className="font-semibold text-gray-800 text-sm md:text-base truncate">{record.category}</p>
                      <p className="text-xs text-gray-500 break-words">{record.date} {record.note ? `• ${record.note}` : ''}</p>
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-end gap-1.5 shrink-0 pl-2">
                    <span className={`font-bold text-sm md:text-base ${record.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                      {record.type === 'income' ? '+' : '-'}฿{record.amount.toLocaleString()}
                    </span>
                    <div className="flex gap-1">
                      <button onClick={() => handleEdit(record)} className="text-gray-400 hover:text-blue-500 p-1.5 transition bg-white rounded-md shadow-sm border border-gray-200" title="แก้ไข">
                        <Edit2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                      </button>
                      <button onClick={() => handleDelete(record.id, record)} className="text-gray-400 hover:text-red-500 p-1.5 transition bg-white rounded-md shadow-sm border border-gray-200" title="ลบ">
                        <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* Modal สำหรับจัดการ หุ้นส่วน/ค่าแรง */}
      {partnerModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-800 border-b pb-3">
              {partnerModal.mode === 'add' ? <UserPlus className="text-blue-500" /> : <Settings className="text-blue-500" />}
              {partnerModal.mode === 'add' ? 'เพิ่มรายชื่อหุ้นส่วน/พนักงาน' : `ตั้งยอดค่าแรง: ${partnerModal.data?.name}`}
            </h3>
            
            <form onSubmit={handlePartnerSubmit}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {partnerModal.mode === 'add' ? 'ชื่อ - นามสกุล' : 'ระบุยอดรอจ่าย (บาท)'}
                  </label>
                  <input 
                    type={partnerModal.mode === 'add' ? 'text' : 'number'}
                    step={partnerModal.mode === 'add' ? undefined : 'any'}
                    min="0"
                    value={partnerModal.value}
                    onChange={(e) => setPartnerModal({...partnerModal, value: e.target.value})}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900"
                    placeholder={partnerModal.mode === 'add' ? 'นาย A' : '0.00'}
                    autoFocus
                  />
                  {partnerModal.mode === 'setWage' && (
                    <p className="text-xs text-orange-600 mt-2">* ยอดนี้คือ "ยอดรอจ่าย" ยังไม่ถูกหักออกจากบัญชีกองกลางจนกว่าจะกดปุ่ม "จ่ายเงิน"</p>
                  )}
                </div>
              </div>
              <div className="flex gap-2 mt-6 pt-2">
                <button 
                  type="button" 
                  onClick={() => setPartnerModal({ isOpen: false, mode: '', data: null, value: '' })}
                  className="flex-1 py-2.5 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition"
                >
                  ยกเลิก
                </button>
                <button 
                  type="submit" 
                  className="flex-1 py-2.5 text-white bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-bold transition shadow-sm"
                >
                  บันทึก
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}