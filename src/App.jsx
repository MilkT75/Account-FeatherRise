import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { 
  getFirestore, collection, onSnapshot, addDoc, 
  deleteDoc, doc, updateDoc, setDoc, serverTimestamp, writeBatch 
} from 'firebase/firestore';
import { 
  PlusCircle, MinusCircle, Wallet, Trash2, Edit2, 
  X, Check, Filter, Users, UserPlus, Banknote, Settings,
  LogIn, LogOut, Lock, Calculator, ChefHat, ShoppingBag, History
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
// 2. ตั้งค่าระบบ Security & Webhook
// ==========================================
const GOOGLE_SHEET_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbxMeGK6Bzv9FyIc6jlsMPWCtUqxyppxmD4eLTnUtkkrBHRFuwKluWsbOroYf_FF8Bae8A/exec";
const ADMIN_PIN = "842019";

// ==========================================
// 3. Main Component
// ==========================================
export default function App() {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(() => localStorage.getItem('accounting_admin') === 'true');
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [pinInput, setPinInput] = useState('');

  const [records, setRecords] = useState([]);
  const [partners, setPartners] = useState([]);
  const [shopCapital, setShopCapital] = useState(0);
  const [loading, setLoading] = useState(true);
  
  // Main Accounting Form State
  const [formData, setFormData] = useState({
    type: 'income', amount: '', category: '',
    date: new Date().toISOString().split('T')[0], note: ''
  });
  
  // Edit & Filter State
  const [editingId, setEditingId] = useState(null);
  const [filterMonth, setFilterMonth] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  // Partner & Wage Calculation State
  const [partnerModal, setPartnerModal] = useState({ isOpen: false, mode: '', data: null, value: '' });
  const [wageSettings, setWageSettings] = useState({ prepRate: 0, sellRate: 0 }); // เรทค่าแรงต่อกล่อง
  const [wageHistory, setWageHistory] = useState([]); // ประวัติคำนวณค่าแรง
  const [wageForm, setWageForm] = useState({
    date: new Date().toISOString().split('T')[0],
    boxes: '',
    prepPartners: [], // เก็บ ID
    sellPartners: []  // เก็บ ID
  });
  const [wageSettingsModal, setWageSettingsModal] = useState({ isOpen: false, prepRate: '', sellRate: '' });
  const [partnerSelectModal, setPartnerSelectModal] = useState({ isOpen: false, type: '' }); // 'prep' | 'sell'

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

    // 1. ดึงบัญชีหลัก
    const unsubRecords = onSnapshot(collection(db, 'accounting_records'), (snapshot) => {
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

    // 2. ดึงหุ้นส่วน
    const unsubPartners = onSnapshot(collection(db, 'accounting_partners'), (snapshot) => {
      const pData = [];
      snapshot.forEach(doc => pData.push({ id: doc.id, ...doc.data() }));
      pData.sort((a, b) => {
          const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
          const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
          return timeA - timeB;
      });
      setPartners(pData);
    });

    // 3. ดึงทุนร้าน
    const unsubCapital = onSnapshot(doc(db, 'accounting_settings', 'capital'), (docSnap) => {
      if (docSnap.exists()) setShopCapital(docSnap.data().amount || 0);
    });

    // 4. ดึงเรทค่าแรง (ตั้งค่า)
    const unsubWageRates = onSnapshot(doc(db, 'accounting_settings', 'wageRates'), (docSnap) => {
      if (docSnap.exists()) setWageSettings(docSnap.data());
      else setWageSettings({ prepRate: 0, sellRate: 0 }); // Default
    });

    // 5. ดึงประวัติคำนวณค่าแรงกล่อง
    const unsubWageHistory = onSnapshot(collection(db, 'accounting_wage_logs'), (snapshot) => {
      const wData = [];
      snapshot.forEach(doc => wData.push({ id: doc.id, ...doc.data() }));
      wData.sort((a, b) => {
          const dateDiff = new Date(b.date) - new Date(a.date);
          if (dateDiff !== 0) return dateDiff;
          const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
          const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
          return timeB - timeA;
      });
      setWageHistory(wData);
      setLoading(false);
    });

    return () => { unsubRecords(); unsubPartners(); unsubCapital(); unsubWageRates(); unsubWageHistory(); };
  }, [user]);

  // === ระบบ Login Admin ===
  const handleLogin = (e) => {
    e.preventDefault();
    if (pinInput === ADMIN_PIN) {
      setIsAdmin(true);
      localStorage.setItem('accounting_admin', 'true');
      setShowLoginModal(false);
      setPinInput('');
    } else {
      alert("รหัส PIN ไม่ถูกต้อง");
      setPinInput('');
    }
  };

  const handleLogout = () => {
    setIsAdmin(false);
    localStorage.removeItem('accounting_admin');
    setEditingId(null);
  };

  // ==========================================
  // 5. Helper Functions
  // ==========================================
  const sendWebhook = (action, data) => {
    if (!GOOGLE_SHEET_WEBHOOK_URL) return;
    fetch(GOOGLE_SHEET_WEBHOOK_URL, {
      method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...data, targetSheet: 'Sheet2', timestamp: new Date().toISOString() })
    }).catch(err => console.error('Webhook error:', err));
  };

  const logAction = async (action, data) => {
    if (!db || !isAdmin) return;
    try {
      await addDoc(collection(db, 'accounting_logs'), { action, data, timestamp: serverTimestamp() });
      sendWebhook(action, data);
    } catch (e) { console.error("Log error:", e); }
  };

  // ==========================================
  // 6. Accounting Handlers (บัญชีหลัก)
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
    if (!user || !db || !isAdmin) { alert('คุณไม่มีสิทธิ์แก้ไขข้อมูล'); return; }
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
    if(!isAdmin) return;
    setEditingId(record.id);
    setFormData({ type: record.type, amount: record.amount.toString(), category: record.category, date: record.date, note: record.note || '' });
    const formElement = document.getElementById('record-form');
    if (formElement) formElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleDelete = async (id, recordData) => {
    if (!user || !db || !isAdmin) return;
    if (!window.confirm("ต้องการลบรายการบัญชีนี้ใช่หรือไม่?")) return;
    try {
      await deleteDoc(doc(db, 'accounting_records', id));
      await logAction('DELETE', { id, ...recordData });
    } catch (err) { alert("เกิดข้อผิดพลาด: " + err.message); }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormData({ type: 'income', amount: '', category: '', date: new Date().toISOString().split('T')[0], note: '' });
  };

  // ==========================================
  // 7. Partner / Wage Handlers (ระบบหุ้นส่วนพื้นฐาน)
  // ==========================================
  const handlePartnerSubmit = async (e) => {
    e.preventDefault();
    if (!user || !db || !isAdmin) return;
    const { mode, data, value } = partnerModal;
    try {
        if (mode === 'add') {
            if (!value.trim()) return alert('กรุณาระบุชื่อ');
            await addDoc(collection(db, 'accounting_partners'), { name: value.trim(), pendingWage: 0, createdAt: serverTimestamp() });
        } else if (mode === 'setWage') {
            const amount = Number(value);
            if (isNaN(amount) || amount < 0) return alert('จำนวนเงินไม่ถูกต้อง');
            await updateDoc(doc(db, 'accounting_partners', data.id), { pendingWage: amount });
        }
        setPartnerModal({ isOpen: false, mode: '', data: null, value: '' });
    } catch (err) { alert("Error: " + err.message); }
  };

  const handlePayWage = async (partner) => {
      if (!user || !db || !isAdmin) return;
      if (!partner.pendingWage || partner.pendingWage <= 0) return alert(`ไม่มียอดรอจ่ายสำหรับ ${partner.name}`);
      if (!window.confirm(`ยืนยันการจ่ายค่าแรงให้ ${partner.name} จำนวน ฿${partner.pendingWage.toLocaleString()} ?\n(ตัดเงินจากกองกลางและล้างยอดเป็น 0)`)) return;

      try {
          const batch = writeBatch(db);
          // สร้างรายจ่าย
          const recordRef = doc(collection(db, 'accounting_records'));
          const recordPayload = { type: 'expense', amount: partner.pendingWage, category: 'ค่าแรง', date: new Date().toISOString().split('T')[0], note: `จ่ายค่าแรง: ${partner.name}`, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
          batch.set(recordRef, recordPayload);
          // รีเซ็ตยอดรอจ่าย
          const partnerRef = doc(db, 'accounting_partners', partner.id);
          batch.update(partnerRef, { pendingWage: 0 });
          // บันทึก
          await batch.commit();
          await logAction('CREATE_PAY_WAGE', { id: recordRef.id, ...recordPayload });
          alert(`จ่ายค่าแรงให้ ${partner.name} สำเร็จแล้ว`);
      } catch (err) { alert("เกิดข้อผิดพลาด: " + err.message); }
  };

  const handleDeletePartner = async (partnerId) => {
      if(!isAdmin) return;
      if(!window.confirm("คุณต้องการลบรายชื่อหุ้นส่วนนี้ออกจากระบบใช่หรือไม่?")) return;
      await deleteDoc(doc(db, 'accounting_partners', partnerId));
  };

  const handleCapitalUpdate = async (value) => {
    if (!isAdmin || !db) return;
    const amount = Number(value) || 0;
    try { await setDoc(doc(db, 'accounting_settings', 'capital'), { amount }); } catch (e) { console.error("Capital err:", e); }
  };

  // ==========================================
  // 8. Advanced Wage Calculation (คำนวณตามกล่อง)
  // ==========================================
  const handleSaveWageSettings = async (e) => {
    e.preventDefault();
    if(!isAdmin || !db) return;
    try {
        await setDoc(doc(db, 'accounting_settings', 'wageRates'), {
            prepRate: Number(wageSettingsModal.prepRate) || 0,
            sellRate: Number(wageSettingsModal.sellRate) || 0
        });
        setWageSettingsModal({ isOpen: false, prepRate: '', sellRate: '' });
    } catch (e) { alert('ตั้งค่าล้มเหลว: ' + e.message); }
  };

  const togglePartnerSelection = (partnerId, type) => {
      setWageForm(prev => {
          const list = prev[type === 'prep' ? 'prepPartners' : 'sellPartners'];
          const newList = list.includes(partnerId) ? list.filter(id => id !== partnerId) : [...list, partnerId];
          return { ...prev, [type === 'prep' ? 'prepPartners' : 'sellPartners']: newList };
      });
  };

  const handleCalculateWages = async () => {
      if (!user || !db || !isAdmin) return;
      const boxes = Number(wageForm.boxes);
      if (!boxes || boxes <= 0) return alert('กรุณาระบุจำนวนกล่องให้ถูกต้อง');
      if (wageForm.prepPartners.length === 0 && wageForm.sellPartners.length === 0) return alert('กรุณาเลือกคนทำไก่ หรือ คนขายไก่ อย่างน้อย 1 คน');

      const prepTotal = boxes * (wageSettings.prepRate || 0);
      const sellTotal = boxes * (wageSettings.sellRate || 0);
      const prepPerPerson = wageForm.prepPartners.length > 0 ? prepTotal / wageForm.prepPartners.length : 0;
      const sellPerPerson = wageForm.sellPartners.length > 0 ? sellTotal / wageForm.sellPartners.length : 0;

      if (!window.confirm(`ยืนยันการคำนวณและแจกจ่าย?\nทำไก่รวม: ฿${prepTotal} (${wageForm.prepPartners.length} คน)\nขายไก่รวม: ฿${sellTotal} (${wageForm.sellPartners.length} คน)`)) return;

      try {
          const batch = writeBatch(db);
          const earningsMap = {}; // mapping id -> total earned
          const prepNames = [];
          const sellNames = [];

          // รวบรวมยอดทำไก่
          wageForm.prepPartners.forEach(id => {
              earningsMap[id] = (earningsMap[id] || 0) + prepPerPerson;
              const p = partners.find(x => x.id === id);
              if(p) prepNames.push(p.name);
          });
          // รวบรวมยอดขายไก่
          wageForm.sellPartners.forEach(id => {
              earningsMap[id] = (earningsMap[id] || 0) + sellPerPerson;
              const p = partners.find(x => x.id === id);
              if(p) sellNames.push(p.name);
          });

          // บันทึกยอดอัปเดตใส่พาร์ทเนอร์
          Object.keys(earningsMap).forEach(partnerId => {
              const partner = partners.find(p => p.id === partnerId);
              if (partner) {
                  const newWage = (partner.pendingWage || 0) + earningsMap[partnerId];
                  batch.update(doc(db, 'accounting_partners', partnerId), { pendingWage: newWage });
              }
          });

          // บันทึกประวัติแยก
          const logRef = doc(collection(db, 'accounting_wage_logs'));
          batch.set(logRef, {
              date: wageForm.date,
              boxes,
              prepRate: wageSettings.prepRate || 0,
              sellRate: wageSettings.sellRate || 0,
              prepTotal,
              sellTotal,
              prepNames, // เก็บชื่อไว้แสดงประวัติ
              sellNames, // เก็บชื่อไว้แสดงประวัติ
              createdAt: serverTimestamp()
          });

          await batch.commit();
          
          // รีเซ็ตฟอร์ม
          setWageForm({ date: new Date().toISOString().split('T')[0], boxes: '', prepPartners: [], sellPartners: [] });
          alert('คำนวณและเพิ่มยอดลงบัญชีหุ้นส่วนสำเร็จ');
      } catch (err) {
          alert('เกิดข้อผิดพลาด: ' + err.message);
      }
  };

  const handleDeleteWageLog = async (logId) => {
    if(!isAdmin) return;
    if(!window.confirm("ต้องการลบประวัติการคำนวณนี้ใช่หรือไม่?\n(หมายเหตุ: ยอดที่แจกจ่ายไปแล้วจะไม่ถูกดึงกลับอัตโนมัติ คุณต้องไปลดยอดเอง)")) return;
    await deleteDoc(doc(db, 'accounting_wage_logs', logId));
  };


  // ==========================================
  // 9. Render Data Computations
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
  const totalPendingWages = partners.reduce((sum, p) => sum + (Number(p.pendingWage) || 0), 0);
  const netProfitLoss = balance - Number(shopCapital || 0) - totalPendingWages;

  if (loading) return <div className="min-h-screen flex items-center justify-center font-sans text-gray-500 bg-gray-50">กำลังโหลดระบบบัญชี...</div>;

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900 pb-20">
      {/* Header */}
      <div className="bg-blue-600 text-white p-4 shadow-md sticky top-0 z-20">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <h1 className="text-lg md:text-xl font-bold flex items-center gap-2">
            <Wallet className="w-6 h-6" /> ระบบบัญชี
            {!isAdmin && <span className="bg-white/20 text-white text-xs px-2 py-0.5 rounded-full font-medium">โหมดผู้เยี่ยมชม</span>}
            {isAdmin && <span className="bg-green-400 text-white text-xs px-2 py-0.5 rounded-full font-medium shadow-sm">โหมดแอดมิน</span>}
          </h1>
          
          <div className="w-full sm:w-auto flex justify-end">
            {!isAdmin ? (
              <button onClick={() => setShowLoginModal(true)} className="flex items-center gap-1.5 bg-gray-900 hover:bg-black text-white px-3 py-1.5 rounded-lg text-sm font-medium transition shadow-sm">
                 <Lock size={14} /> เข้าระบบแก้ไข
              </button>
            ) : (
              <button onClick={handleLogout} className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white border border-white/30 px-3 py-1.5 rounded-lg text-sm font-medium transition">
                 <LogOut size={14} /> ออกจากระบบ
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-3 md:p-6 space-y-4 md:space-y-6">
        
        {/* Dashboard - 6 Cards Layout */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-green-500 flex flex-col justify-between">
            <p className="text-xs md:text-sm text-gray-500 font-medium">รายรับรวม</p>
            <p className="text-lg md:text-2xl font-bold text-green-600">฿{totals.income.toLocaleString()}</p>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-rose-500 flex flex-col justify-between">
            <p className="text-xs md:text-sm text-gray-500 font-medium">รายจ่ายรวม</p>
            <p className="text-lg md:text-2xl font-bold text-rose-600">฿{totals.expense.toLocaleString()}</p>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-blue-500 flex flex-col justify-between col-span-2 md:col-span-1">
            <p className="text-xs md:text-sm text-gray-500 font-medium">ยอดคงเหลือสุทธิ</p>
            <p className="text-lg md:text-2xl font-bold text-blue-600">฿{balance.toLocaleString()}</p>
          </div>

          <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-purple-500 flex flex-col justify-between">
            <p className="text-xs md:text-sm text-gray-500 font-medium">มูลค่าทุนร้าน</p>
            <div className="flex items-center">
              <span className="text-lg md:text-2xl font-bold text-purple-600 mr-1">฿</span>
              {isAdmin ? (
                <input 
                  type="number" min="0" step="any"
                  value={shopCapital}
                  onChange={(e) => setShopCapital(e.target.value === '' ? '' : Number(e.target.value))}
                  onBlur={(e) => handleCapitalUpdate(e.target.value)}
                  className="text-lg md:text-2xl font-bold text-purple-600 bg-transparent outline-none w-full border-b border-dashed border-gray-300 focus:border-purple-500"
                  placeholder="0"
                />
              ) : (
                <span className="text-lg md:text-2xl font-bold text-purple-600">{Number(shopCapital).toLocaleString()}</span>
              )}
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-orange-500 flex flex-col justify-between">
            <p className="text-xs md:text-sm text-gray-500 font-medium">ค่าแรงรอจ่ายรวม</p>
            <p className="text-lg md:text-2xl font-bold text-orange-600">฿{totalPendingWages.toLocaleString()}</p>
          </div>
          <div className={`bg-white p-4 rounded-xl shadow-sm border-l-4 ${netProfitLoss >= 0 ? 'border-teal-500' : 'border-red-600'} flex flex-col justify-between col-span-2 md:col-span-1`}>
            <p className="text-xs md:text-sm text-gray-500 font-medium">สถานะร้าน (กำไร/ขาดทุน)</p>
            <p className={`text-lg md:text-2xl font-bold ${netProfitLoss >= 0 ? 'text-teal-600' : 'text-red-600'}`}>
              {netProfitLoss >= 0 ? '+' : ''}฿{netProfitLoss.toLocaleString()}
            </p>
          </div>
        </div>

        {/* ระบบ Face Card ID หุ้นส่วน / จ่ายค่าแรง */}
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
              <h2 className="text-base md:text-lg font-semibold text-gray-800 flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-500" /> จัดการค่าแรง / หุ้นส่วน
              </h2>
              {isAdmin && (
                <button 
                  onClick={() => setPartnerModal({ isOpen: true, mode: 'add', data: null, value: '' })}
                  className="flex items-center gap-1.5 text-sm bg-blue-50 text-blue-600 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition w-full sm:w-auto justify-center"
                >
                  <UserPlus className="w-4 h-4" /> เพิ่มรายชื่อ
                </button>
              )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {partners.length === 0 ? (
               <div className="col-span-full p-6 text-center text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200">ยังไม่มีรายชื่อ</div>
            ) : (
              partners.map((partner) => (
                <div key={partner.id} className="border border-gray-200 rounded-xl p-4 flex flex-col items-center justify-center gap-3 hover:shadow-md transition-shadow bg-white relative group">
                  {isAdmin && (
                    <button 
                       onClick={() => handleDeletePartner(partner.id)} 
                       className="absolute top-2 right-2 text-gray-300 hover:text-red-500 transition-colors p-1"
                       title="ลบรายชื่อนี้"
                    >
                       <X className="w-4 h-4" />
                    </button>
                  )}

                  <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center shadow-inner mt-2">
                    <Users className="w-6 h-6 text-gray-500" />
                  </div>
                  <div className="text-center w-full">
                      <span className="font-bold text-gray-800 text-sm block truncate">{partner.name}</span>
                      <span className={`text-xs mt-1 block ${partner.pendingWage > 0 ? 'text-orange-500 font-semibold' : 'text-gray-400'}`}>
                         ยอดรอจ่าย: ฿{(partner.pendingWage || 0).toLocaleString()}
                      </span>
                  </div>
                  
                  {isAdmin && (
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
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* ========================================== */}
        {/* ฟังก์ชันคำนวณค่าแรงจากกล่อง (แสดงเฉพาะ Admin) */}
        {/* ========================================== */}
        {isAdmin && (
          <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-orange-200 animate-in fade-in bg-gradient-to-br from-white to-orange-50/30">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 border-b border-orange-100 pb-3 gap-2">
              <h2 className="text-base md:text-lg font-semibold text-orange-800 flex items-center gap-2">
                <Calculator className="w-5 h-5" /> คำนวณค่าแรงจากยอดขาย (กล่อง)
              </h2>
              <button 
                onClick={() => setWageSettingsModal({ isOpen: true, prepRate: wageSettings.prepRate, sellRate: wageSettings.sellRate })}
                className="text-orange-600 hover:text-orange-800 text-sm flex items-center gap-1 font-medium bg-orange-100 px-3 py-1.5 rounded-lg transition"
              >
                <Settings className="w-4 h-4" /> ตั้งค่าเรทค่าแรง
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">วันที่*</label>
                <input 
                  type="date" value={wageForm.date} onChange={e => setWageForm({...wageForm, date: e.target.value})}
                  onClick={(e) => { try { e.target.showPicker() } catch(err){} }}
                  className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none bg-white"
                />
              </div>
              <div className="md:col-span-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">ยอดขาย (จำนวนกล่อง)*</label>
                <input 
                  type="number" min="0" step="any" placeholder="0"
                  value={wageForm.boxes} onChange={e => setWageForm({...wageForm, boxes: e.target.value})}
                  className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none bg-white font-bold text-orange-600"
                />
              </div>
              <div className="md:col-span-1">
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center justify-between">
                  <span>คนทำไก่</span>
                  <span className="text-xs text-orange-500">(เรท ฿{wageSettings.prepRate}/กล่อง)</span>
                </label>
                <button 
                  type="button" onClick={() => setPartnerSelectModal({ isOpen: true, type: 'prep' })}
                  className={`w-full p-2.5 border rounded-lg flex items-center justify-between transition ${wageForm.prepPartners.length > 0 ? 'bg-orange-100 border-orange-300 text-orange-800' : 'bg-gray-50 border-gray-300 text-gray-500 hover:bg-gray-100'}`}
                >
                  <span className="flex items-center gap-1.5"><ChefHat className="w-4 h-4"/> เลือกพนักงาน</span>
                  <span className="font-bold">{wageForm.prepPartners.length} คน</span>
                </button>
              </div>
              <div className="md:col-span-1">
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center justify-between">
                  <span>คนขายไก่</span>
                  <span className="text-xs text-orange-500">(เรท ฿{wageSettings.sellRate}/กล่อง)</span>
                </label>
                <button 
                  type="button" onClick={() => setPartnerSelectModal({ isOpen: true, type: 'sell' })}
                  className={`w-full p-2.5 border rounded-lg flex items-center justify-between transition ${wageForm.sellPartners.length > 0 ? 'bg-orange-100 border-orange-300 text-orange-800' : 'bg-gray-50 border-gray-300 text-gray-500 hover:bg-gray-100'}`}
                >
                  <span className="flex items-center gap-1.5"><ShoppingBag className="w-4 h-4"/> เลือกพนักงาน</span>
                  <span className="font-bold">{wageForm.sellPartners.length} คน</span>
                </button>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button 
                onClick={handleCalculateWages}
                className="w-full md:w-auto bg-orange-500 hover:bg-orange-600 text-white font-bold py-2.5 px-6 rounded-lg transition shadow-md flex items-center justify-center gap-2"
              >
                <Calculator className="w-5 h-5" /> คำนวณและแจกจ่ายค่าแรง
              </button>
            </div>

            {/* แสดงประวัติการคำนวณ */}
            {wageHistory.length > 0 && (
              <div className="mt-6 border-t border-orange-100 pt-4">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1 mb-3"><History className="w-4 h-4"/> ประวัติการคำนวณค่าแรงย้อนหลัง</h3>
                <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                  {wageHistory.map(log => (
                    <div key={log.id} className="bg-white border border-gray-100 rounded-lg p-3 text-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-2 hover:bg-orange-50/50 transition">
                      <div>
                        <span className="font-bold text-gray-800">{log.date}</span>
                        <span className="mx-2 text-gray-300">|</span>
                        <span className="text-orange-600 font-medium">ยอดขาย {log.boxes} กล่อง</span>
                        <div className="text-xs text-gray-500 mt-1">
                          {log.prepNames?.length > 0 && <span><ChefHat className="w-3 h-3 inline mr-1 text-gray-400"/> ทำไก่: {log.prepNames.join(', ')} (รวม ฿{log.prepTotal})</span>}
                          {log.prepNames?.length > 0 && log.sellNames?.length > 0 && <span className="mx-1 text-gray-300">|</span>}
                          {log.sellNames?.length > 0 && <span><ShoppingBag className="w-3 h-3 inline mr-1 text-gray-400"/> ขายไก่: {log.sellNames.join(', ')} (รวม ฿{log.sellTotal})</span>}
                        </div>
                      </div>
                      <button onClick={() => handleDeleteWageLog(log.id)} className="text-gray-400 hover:text-red-500 p-1 bg-gray-50 rounded md:ml-auto">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}


        {/* Input Form บัญชีหลัก (ซ่อนถ้าไม่ใช่ Admin) */}
        {isAdmin && (
          <div id="record-form" className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-gray-200 animate-in fade-in duration-300">
            <h2 className="text-base md:text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              {editingId ? <Edit2 className="w-5 h-5 text-yellow-500" /> : <PlusCircle className="w-5 h-5 text-blue-500" />}
              {editingId ? 'แก้ไขรายการบัญชี' : 'บันทึกรายการบัญชีกองกลาง'}
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-4 md:space-y-5">
              <div className="grid grid-cols-2 gap-3 md:gap-4">
                <button type="button" onClick={() => handleInputChange({ target: { name: 'type', value: 'income' } })} className={`py-2.5 md:py-3 rounded-lg font-bold flex justify-center items-center gap-2 transition ${formData.type === 'income' ? 'bg-green-500 text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                  <PlusCircle className="w-5 h-5" /> รายรับ
                </button>
                <button type="button" onClick={() => handleInputChange({ target: { name: 'type', value: 'expense' } })} className={`py-2.5 md:py-3 rounded-lg font-bold flex justify-center items-center gap-2 transition ${formData.type === 'expense' ? 'bg-red-500 text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                  <MinusCircle className="w-5 h-5" /> รายจ่าย
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">จำนวนเงิน (บาท)*</label>
                  <input type="number" name="amount" min="0" step="any" value={formData.amount} onChange={handleInputChange} className="w-full p-2.5 md:p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900 shadow-sm" placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">หมวดหมู่*</label>
                  <select name="category" value={formData.category} onChange={handleInputChange} className="w-full p-2.5 md:p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900 shadow-sm">
                    <option value="" disabled>-- เลือกหมวดหมู่ --</option>
                    {categories[formData.type].map(cat => ( <option key={cat} value={cat}>{cat}</option> ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">วันที่*</label>
                  <input type="date" name="date" value={formData.date} onChange={handleInputChange} onClick={(e) => { try { e.target.showPicker() } catch(err){} }} className="w-full p-2.5 md:p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900 shadow-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ</label>
                  <input type="text" name="note" value={formData.note} onChange={handleInputChange} className="w-full p-2.5 md:p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900 shadow-sm" placeholder="ระบุเพิ่มเติม..." />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-bold flex justify-center items-center gap-2 transition shadow-sm">
                  <Check className="w-5 h-5" /> {editingId ? 'บันทึกการแก้ไขบัญชี' : 'บันทึกลงบัญชี'}
                </button>
                {editingId && (
                  <button type="button" onClick={cancelEdit} className="py-3 sm:px-6 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-medium flex justify-center items-center transition">ยกเลิกการแก้ไข</button>
                )}
              </div>
            </form>
          </div>
        )}

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
              onClick={(e) => { try { e.target.showPicker() } catch(err){} }}
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
                    {isAdmin && (
                      <div className="flex gap-1">
                        <button onClick={() => handleEdit(record)} className="text-gray-400 hover:text-blue-500 p-1.5 transition bg-white rounded-md shadow-sm border border-gray-200" title="แก้ไข">
                          <Edit2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                        </button>
                        <button onClick={() => handleDelete(record.id, record)} className="text-gray-400 hover:text-red-500 p-1.5 transition bg-white rounded-md shadow-sm border border-gray-200" title="ลบ">
                          <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* ==================================================== */}
      {/* MODALS SECTION */}
      {/* ==================================================== */}

      {/* Modal Login */}
      {showLoginModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 animate-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center justify-center mb-6">
              <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-3">
                 <Lock size={24} />
              </div>
              <h3 className="text-lg font-bold text-gray-800">เข้าสู่ระบบ Admin</h3>
              <p className="text-sm text-gray-500 text-center mt-1">ใส่รหัส PIN เพื่อจัดการระบบบัญชี</p>
            </div>
            
            <form onSubmit={handleLogin}>
              <div className="mb-5">
                <input 
                  type="password" pattern="[0-9]*" inputMode="numeric"
                  value={pinInput} onChange={(e) => setPinInput(e.target.value)} 
                  className="w-full p-3 text-center text-2xl tracking-[0.5em] border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900" 
                  placeholder="••••••" autoFocus required 
                />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => { setShowLoginModal(false); setPinInput(''); }} className="flex-1 py-2.5 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition">ยกเลิก</button>
                <button type="submit" className="flex-1 py-2.5 text-white bg-blue-600 hover:bg-blue-700 rounded-lg font-bold transition shadow-sm">ปลดล็อก</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal จัดการ หุ้นส่วนพื้นฐาน */}
      {partnerModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-800 border-b pb-3">
              {partnerModal.mode === 'add' ? <UserPlus className="text-blue-500" /> : <Settings className="text-blue-500" />}
              {partnerModal.mode === 'add' ? 'เพิ่มรายชื่อหุ้นส่วน' : `ตั้งยอดค่าแรง: ${partnerModal.data?.name}`}
            </h3>
            <form onSubmit={handlePartnerSubmit}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {partnerModal.mode === 'add' ? 'ชื่อ - นามสกุล' : 'ระบุยอดรอจ่าย (บาท)'}
                  </label>
                  <input 
                    type={partnerModal.mode === 'add' ? 'text' : 'number'}
                    step={partnerModal.mode === 'add' ? undefined : 'any'} min="0"
                    value={partnerModal.value} onChange={(e) => setPartnerModal({...partnerModal, value: e.target.value})}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900"
                    placeholder={partnerModal.mode === 'add' ? 'ชื่อบุคคล' : '0.00'} autoFocus
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-6 pt-2">
                <button type="button" onClick={() => setPartnerModal({ isOpen: false, mode: '', data: null, value: '' })} className="flex-1 py-2.5 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition">ยกเลิก</button>
                <button type="submit" className="flex-1 py-2.5 text-white bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-bold transition shadow-sm">บันทึก</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal ตั้งค่าเรทค่าแรง */}
      {wageSettingsModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-800 border-b pb-3">
              <Settings className="text-orange-500" /> ตั้งค่าเรทค่าแรง (ต่อกล่อง)
            </h3>
            <form onSubmit={handleSaveWageSettings}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ค่าแรงทำไก่ (บาท/กล่อง)</label>
                  <input type="number" step="any" min="0" required
                    value={wageSettingsModal.prepRate} onChange={(e) => setWageSettingsModal({...wageSettingsModal, prepRate: e.target.value})}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none bg-white text-gray-900"
                    placeholder="0.00" autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ค่าแรงขายไก่ (บาท/กล่อง)</label>
                  <input type="number" step="any" min="0" required
                    value={wageSettingsModal.sellRate} onChange={(e) => setWageSettingsModal({...wageSettingsModal, sellRate: e.target.value})}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none bg-white text-gray-900"
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-6 pt-2">
                <button type="button" onClick={() => setWageSettingsModal({ isOpen: false, prepRate: '', sellRate: '' })} className="flex-1 py-2.5 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition">ยกเลิก</button>
                <button type="submit" className="flex-1 py-2.5 text-white bg-orange-600 hover:bg-orange-700 rounded-lg text-sm font-bold transition shadow-sm">บันทึกตั้งค่า</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal เลือกคนทำงาน */}
      {partnerSelectModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-800 border-b pb-3 shrink-0">
              {partnerSelectModal.type === 'prep' ? <ChefHat className="text-orange-500" /> : <ShoppingBag className="text-orange-500" />}
              เลือกคน{partnerSelectModal.type === 'prep' ? 'ทำไก่' : 'ขายไก่'}
            </h3>
            
            <div className="overflow-y-auto flex-1 space-y-2 pr-2 mb-4">
              {partners.length === 0 ? <p className="text-center text-sm text-gray-400 py-4">ยังไม่มีรายชื่อพนักงาน</p> : null}
              {partners.map(p => {
                 const isSelected = wageForm[partnerSelectModal.type === 'prep' ? 'prepPartners' : 'sellPartners'].includes(p.id);
                 return (
                   <label key={p.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${isSelected ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                      <input 
                        type="checkbox" 
                        checked={isSelected}
                        onChange={() => togglePartnerSelection(p.id, partnerSelectModal.type)}
                        className="w-5 h-5 text-orange-600 rounded focus:ring-orange-500 cursor-pointer"
                      />
                      <span className={`font-medium ${isSelected ? 'text-orange-800' : 'text-gray-700'}`}>{p.name}</span>
                   </label>
                 );
              })}
            </div>
            
            <button 
              type="button" 
              onClick={() => setPartnerSelectModal({ isOpen: false, type: '' })} 
              className="w-full py-3 text-white bg-gray-800 hover:bg-black rounded-lg text-sm font-bold transition shadow-sm shrink-0"
            >
              ตกลง
            </button>
          </div>
        </div>
      )}

    </div>
  );
}