import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { 
  getFirestore, collection, onSnapshot, addDoc, 
  deleteDoc, doc, updateDoc, setDoc, serverTimestamp, writeBatch 
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { 
  PlusCircle, MinusCircle, Wallet, Trash2, Edit2, 
  X, Check, Filter, Users, UserPlus, Banknote, Settings,
  LogOut, Lock, Calculator, ChefHat, ShoppingBag, History,
  Undo, Redo, ChevronDown, ChevronUp, Info, Truck, Camera, Image as ImageIcon,
  PieChart, ClipboardList, Plus, Zap, Box, RefreshCw, TrendingUp, Copy
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

let app, db, auth, storage;
try {
  const configToUse = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : firebaseConfig;
  if (Object.keys(configToUse).length > 0) {
      app = initializeApp(configToUse);
      db = getFirestore(app);
      auth = getAuth(app);
      storage = getStorage(app);
  }
} catch (error) {
  console.error("Firebase init error:", error);
}

const GOOGLE_SHEET_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbxMeGK6Bzv9FyIc6jlsMPWCtUqxyppxmD4eLTnUtkkrBHRFuwKluWsbOroYf_FF8Bae8A/exec";
const ADMIN_PIN = "842019";

const scrollbarClass = "[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-gray-400";

// ==========================================
// 2. iOS Animated Modal Component
// ==========================================
const AnimatedModal = ({ isOpen, onClose, children, maxWidth = "max-w-sm", originClass = "origin-center", bgClass = "bg-white", pClass="p-6" }) => {
  const [render, setRender] = useState(isOpen);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setRender(true);
      setTimeout(() => setVisible(true), 10);
    } else {
      setVisible(false);
      const timer = setTimeout(() => setRender(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!render) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div 
        className={`absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`} 
        onClick={onClose} 
      />
      <div 
        className={`relative ${bgClass} rounded-3xl shadow-2xl w-full ${maxWidth} flex flex-col max-h-[90vh] transition-all duration-300 ease-[cubic-bezier(0.17,0.89,0.32,1.15)] ${originClass} ${visible ? 'scale-100 opacity-100 translate-y-0' : 'scale-[0.8] opacity-0 translate-y-4'}`}
        onClick={e => e.stopPropagation()}
      >
        <div className={`overflow-y-auto flex-1 ${pClass} rounded-3xl ${scrollbarClass}`}>
          {children}
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 3. Custom Line Chart Component (SVG)
// ==========================================
const ProfitChart = ({ data }) => {
  if (!data || data.length === 0) return <div className="flex h-full items-center justify-center text-gray-400 text-sm font-medium">ไม่พบข้อมูลสำหรับสร้างกราฟในช่วงเวลานี้</div>;

  const minNet = Math.min(...data.map(d => d.cumulative), 0);
  const maxNet = Math.max(...data.map(d => d.cumulative), 100); 
  const padding = 30;
  const width = 800;
  const height = 240;

  const getX = (index) => padding + (index * (width - padding * 2) / Math.max(data.length - 1, 1));
  const getY = (val) => height - padding - ((val - minNet) / (maxNet - minNet)) * (height - padding * 2);

  const points = data.map((d, i) => `${getX(i)},${getY(d.cumulative)}`).join(' ');

  return (
    <div className="w-full h-full relative overflow-x-auto overflow-y-hidden">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full min-w-[500px] overflow-visible">
        <defs>
          <linearGradient id="lineGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </linearGradient>
        </defs>
        
        {/* Base Line (0) */}
        <line x1={padding} y1={getY(0)} x2={width-padding} y2={getY(0)} stroke="#d1d5db" strokeWidth="1" strokeDasharray="4 4" />

        {/* Fill Area */}
        {data.length > 1 && (
           <polygon points={`${padding},${height-padding} ${points} ${getX(data.length-1)},${height-padding}`} fill="url(#lineGradient)" />
        )}

        {/* Line */}
        {data.length > 1 ? (
           <polyline points={points} fill="none" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
           <circle cx={getX(0)} cy={getY(data[0].cumulative)} r="4" fill="#3b82f6" />
        )}

        {/* Interactive Points & Tooltips */}
        {data.map((d, i) => (
          <g key={i} className="group cursor-pointer">
            <circle cx={getX(i)} cy={getY(d.cumulative)} r="15" fill="transparent" />
            <circle cx={getX(i)} cy={getY(d.cumulative)} r="4" fill="#ffffff" stroke="#3b82f6" strokeWidth="2" className="transition-all group-hover:r-5 group-hover:fill-blue-500" />
            
            <g className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
              <rect x={getX(i) - 45} y={getY(d.cumulative) - 40} width="90" height="24" rx="6" fill="#1e293b" />
              <text x={getX(i)} y={getY(d.cumulative) - 24} textAnchor="middle" className="text-[11px] fill-white font-bold">
                ฿{d.cumulative.toLocaleString(undefined, {maximumFractionDigits: 0})}
              </text>
            </g>

            <text x={getX(i)} y={height - 5} textAnchor="middle" className="text-[10px] fill-gray-400 font-medium">
              {d.displayDate}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
};

// ==========================================
// 4. Main Component
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
  const [isUploading, setIsUploading] = useState(false);
  
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  const [isMainHistoryOpen, setIsMainHistoryOpen] = useState(true);
  const [isWageHistoryOpen, setIsWageHistoryOpen] = useState(true);
  const [isCostSectionOpen, setIsCostSectionOpen] = useState(false);
  const [isChartOpen, setIsChartOpen] = useState(true); 

  const [formData, setFormData] = useState({
    type: 'income', amount: '', category: '', date: new Date().toISOString().split('T')[0], note: ''
  });
  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState('');
  const [receiptViewModal, setReceiptViewModal] = useState({ isOpen: false, url: '' });
  
  const [editingId, setEditingId] = useState(null);
  
  // === Filter States ===
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterCategories, setFilterCategories] = useState([]); 
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [syncWageFilter, setSyncWageFilter] = useState(false); 

  const [partnerModal, setPartnerModal] = useState({ isOpen: false, mode: '', data: null, value: '' });
  const [partnerDetailsModal, setPartnerDetailsModal] = useState({ isOpen: false, partner: null });
  
  const [wageSettings, setWageSettings] = useState({ prepRate: 0, sellRate: 0, deliveryRate: 0, elecUnitPrice: 5 });
  const [wageSettingsModal, setWageSettingsModal] = useState({ isOpen: false, prepRate: '', sellRate: '', deliveryRate: '', elecUnitPrice: '' });
  const [wageHistory, setWageHistory] = useState([]); 
  
  // Wage Form
  const [wageForm, setWageForm] = useState({
    date: new Date().toISOString().split('T')[0], boxes: '', prepPartners: [], sellPartners: []
  });
  const [partnerSelectModal, setPartnerSelectModal] = useState({ isOpen: false, type: '' });

  // Delivery Wage Form
  const [deliveryForm, setDeliveryForm] = useState({
    date: new Date().toISOString().split('T')[0], totalTrips: '', tripsByPartner: {} 
  });
  const [deliverySelectModal, setDeliverySelectModal] = useState({ isOpen: false });

  // Elec Wage Form
  const [elecForm, setElecForm] = useState({
    date: new Date().toISOString().split('T')[0], startMeter: '', endMeter: '', unitPrice: '', providerId: ''
  });

  // Cost Profiles Form
  const [costProfiles, setCostProfiles] = useState([]);
  const [costFormModal, setCostFormModal] = useState({ isOpen: false, mode: 'add', id: null });
  const [costForm, setCostForm] = useState({
    name: '', yieldPieces: '',
    ingredients: [{ id: Date.now(), name: '', price: '', qtyBought: '', unit: '', usage: '', usageType: 'per_recipe' }],
    electricity: { enabled: false, watts: '', unitPrice: '5', minutes: '', piecesPerBatch: '' },
    boxConfig: { piecesPerBox: '', packagingCost: '', laborCost: '' }
  });
  const [costDetailsModal, setCostDetailsModal] = useState({ isOpen: false, profile: null });

  const categories = {
    income: ['ขายสินค้า', 'เงินปันผล', 'รายรับอื่นๆ'],
    expense: ['ค่าแรง', 'ค่าจัดส่ง', 'ค่าวัตถุดิบ', 'ค่าเช่าที่', 'การตลาด', 'รายจ่ายอื่นๆ']
  };
  const allCategories = [...categories.income, ...categories.expense];

  // ==========================================
  // Effects
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

    const unsubCapital = onSnapshot(doc(db, 'accounting_settings', 'capital'), (docSnap) => {
      if (docSnap.exists()) setShopCapital(docSnap.data().amount || 0);
    });

    const unsubWageRates = onSnapshot(doc(db, 'accounting_settings', 'wageRates'), (docSnap) => {
      if (docSnap.exists()) setWageSettings(docSnap.data());
      else setWageSettings({ prepRate: 0, sellRate: 0, deliveryRate: 0, elecUnitPrice: 5 });
    });

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
    });

    const unsubCostProfiles = onSnapshot(collection(db, 'accounting_cost_profiles'), (snapshot) => {
      const cData = [];
      snapshot.forEach(doc => cData.push({ id: doc.id, ...doc.data() }));
      cData.sort((a, b) => {
          const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
          const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
          return timeB - timeA; 
      });
      setCostProfiles(cData);
      setLoading(false);
    });

    return () => { unsubRecords(); unsubPartners(); unsubCapital(); unsubWageRates(); unsubWageHistory(); unsubCostProfiles(); };
  }, [user]);

  // === Authentication ===
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
    setUndoStack([]);
    setRedoStack([]);
  };

  // ==========================================
  // Helper & Undo/Redo
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

  const recordAction = (actionParams) => {
    if(!isAdmin) return;
    setUndoStack(prev => [...prev, actionParams]);
    setRedoStack([]);
  };

  const processUndoRedo = async (action, isUndo) => {
    const batch = writeBatch(db);
    const applyToBatch = (item) => {
        const ref = doc(db, item.col, item.docId);
        const dataToApply = isUndo ? item.oldData : item.newData;
        if (dataToApply === null) batch.delete(ref);
        else batch.set(ref, dataToApply);
    };
    if (action.type === 'single') applyToBatch(action);
    else if (action.type === 'batch') action.items.forEach(applyToBatch);
    await batch.commit();
  };

  const handleUndo = async () => {
    if (undoStack.length === 0 || !user || !db || !isAdmin) return;
    const action = undoStack[undoStack.length - 1];
    try { await processUndoRedo(action, true); setUndoStack(prev => prev.slice(0, -1)); setRedoStack(prev => [...prev, action]);
    } catch(err) { alert("Undo failed: "+err.message); }
  };

  const handleRedo = async () => {
    if (redoStack.length === 0 || !user || !db || !isAdmin) return;
    const action = redoStack[redoStack.length - 1];
    try { await processUndoRedo(action, false); setRedoStack(prev => prev.slice(0, -1)); setUndoStack(prev => [...prev, action]);
    } catch(err) { alert("Redo failed: "+err.message); }
  };

  // ==========================================
  // Accounting Handlers
  // ==========================================
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const newData = { ...prev, [name]: value };
      if (name === 'type') newData.category = '';
      return newData;
    });
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) return alert("ไฟล์ใหญ่เกินไป (ต้องไม่เกิน 5MB)");
      setReceiptFile(file);
      setReceiptPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user || !db || !isAdmin) { alert('คุณไม่มีสิทธิ์แก้ไขข้อมูล'); return; }
    if (!formData.amount || Number(formData.amount) <= 0) return alert('ระบุจำนวนเงินให้ถูกต้อง');
    if (!formData.category) return alert('กรุณาเลือกหมวดหมู่');
    if (!formData.date) return alert('กรุณาระบุวันที่');

    setIsUploading(true);
    let finalReceiptUrl = editingId ? records.find(r => r.id === editingId)?.receiptUrl || null : null;
    if (editingId && !receiptPreview) finalReceiptUrl = null; 

    if (receiptFile) {
        try {
            const storageRef = ref(storage, `receipts/${Date.now()}_${receiptFile.name}`);
            const snapshot = await uploadBytes(storageRef, receiptFile);
            finalReceiptUrl = await getDownloadURL(snapshot.ref);
        } catch (err) {
            alert("อัปโหลดสลิปล้มเหลว: " + err.message);
            setIsUploading(false);
            return;
        }
    }

    const payload = { ...formData, amount: Number(formData.amount), receiptUrl: finalReceiptUrl, updatedAt: serverTimestamp() };
    try {
      if (editingId) {
        const oldRecord = records.find(r => r.id === editingId);
        await updateDoc(doc(db, 'accounting_records', editingId), payload);
        recordAction({ type: 'single', col: 'accounting_records', docId: editingId, oldData: oldRecord, newData: payload });
        await logAction('UPDATE', { id: editingId, ...payload });
        setEditingId(null);
      } else {
        payload.createdAt = serverTimestamp();
        const docRef = await addDoc(collection(db, 'accounting_records'), payload);
        recordAction({ type: 'single', col: 'accounting_records', docId: docRef.id, oldData: null, newData: payload });
        await logAction('CREATE', { id: docRef.id, ...payload });
      }
      setFormData({ type: formData.type, amount: '', category: '', date: new Date().toISOString().split('T')[0], note: '' });
      setReceiptFile(null); setReceiptPreview('');
    } catch (err) { alert("เกิดข้อผิดพลาด: " + err.message); }
    setIsUploading(false);
  };

  const handleEdit = (record) => {
    if(!isAdmin) return;
    setEditingId(record.id);
    setFormData({ type: record.type, amount: record.amount.toString(), category: record.category, date: record.date, note: record.note || '' });
    setReceiptFile(null); setReceiptPreview(record.receiptUrl || '');
    const formElement = document.getElementById('record-form');
    if (formElement) formElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleDelete = async (id, recordData) => {
    if (!user || !db || !isAdmin) return;
    if (!window.confirm("ต้องการลบรายการบัญชีนี้ใช่หรือไม่?")) return;
    try {
      await deleteDoc(doc(db, 'accounting_records', id));
      recordAction({ type: 'single', col: 'accounting_records', docId: id, oldData: recordData, newData: null });
      await logAction('DELETE', { id, ...recordData });
    } catch (err) { alert("เกิดข้อผิดพลาด: " + err.message); }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormData({ type: 'income', amount: '', category: '', date: new Date().toISOString().split('T')[0], note: '' });
    setReceiptFile(null); setReceiptPreview('');
  };

  // ==========================================
  // Partner / Wage Handlers 
  // ==========================================
  const handlePartnerSubmit = async (e) => {
    e.preventDefault();
    if (!user || !db || !isAdmin) return;
    const { mode, data, value } = partnerModal;
    try {
        if (mode === 'add') {
            if (!value.trim()) return alert('กรุณาระบุชื่อ');
            const payload = { name: value.trim(), pendingWage: 0, createdAt: serverTimestamp() };
            const docRef = await addDoc(collection(db, 'accounting_partners'), payload);
            recordAction({ type: 'single', col: 'accounting_partners', docId: docRef.id, oldData: null, newData: payload });
        } else if (mode === 'setWage') {
            const amount = Number(value);
            if (isNaN(amount) || amount < 0) return alert('จำนวนเงินไม่ถูกต้อง');
            await updateDoc(doc(db, 'accounting_partners', data.id), { pendingWage: amount });
            recordAction({ type: 'single', col: 'accounting_partners', docId: data.id, oldData: data, newData: {...data, pendingWage: amount} });
        }
        setPartnerModal(prev => ({ ...prev, isOpen: false }));
    } catch (err) { alert("Error: " + err.message); }
  };

  const handlePayWage = async (partner) => {
      if (!user || !db || !isAdmin) return;
      if (!partner.pendingWage || partner.pendingWage <= 0) return alert(`ไม่มียอดรอจ่ายสำหรับ ${partner.name}`);
      if (!window.confirm(`ยืนยันการจ่ายค่าแรงให้ ${partner.name} จำนวน ฿${partner.pendingWage.toLocaleString()} ?\n(ตัดเงินจากกองกลางและล้างยอดเป็น 0)`)) return;

      try {
          const batch = writeBatch(db);
          const newRecordRef = doc(collection(db, 'accounting_records'));
          const recordPayload = { type: 'expense', amount: partner.pendingWage, category: 'ค่าแรง', date: new Date().toISOString().split('T')[0], note: `จ่ายค่าแรง: ${partner.name}`, receiptUrl: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
          
          batch.set(newRecordRef, recordPayload);
          batch.update(doc(db, 'accounting_partners', partner.id), { pendingWage: 0 });
          await batch.commit();

          recordAction({ type: 'batch', items: [
             { col: 'accounting_records', docId: newRecordRef.id, oldData: null, newData: recordPayload },
             { col: 'accounting_partners', docId: partner.id, oldData: partner, newData: {...partner, pendingWage: 0} }
          ]});
          await logAction('CREATE_PAY_WAGE', { id: newRecordRef.id, ...recordPayload });
      } catch (err) { alert("เกิดข้อผิดพลาด: " + err.message); }
  };

  const handleDeletePartner = async (partnerId) => {
      if(!isAdmin) return;
      if(!window.confirm("คุณต้องการลบรายชื่อหุ้นส่วนนี้ออกจากระบบใช่หรือไม่?")) return;
      const oldData = partners.find(p => p.id === partnerId);
      await deleteDoc(doc(db, 'accounting_partners', partnerId));
      recordAction({ type: 'single', col: 'accounting_partners', docId: partnerId, oldData: oldData, newData: null });
  };

  const handleCapitalUpdate = async (value) => {
    if (!isAdmin || !db) return;
    const amount = Number(value) || 0;
    try { await setDoc(doc(db, 'accounting_settings', 'capital'), { amount }); } catch (e) { console.error("Capital err:", e); }
  };

  // ==========================================
  // Advanced Wage Calculation
  // ==========================================
  const handleSaveWageSettings = async (e) => {
    e.preventDefault();
    if(!isAdmin || !db) return;
    try {
        await setDoc(doc(db, 'accounting_settings', 'wageRates'), {
            prepRate: Number(wageSettingsModal.prepRate) || 0,
            sellRate: Number(wageSettingsModal.sellRate) || 0,
            deliveryRate: Number(wageSettingsModal.deliveryRate) || 0,
            elecUnitPrice: Number(wageSettingsModal.elecUnitPrice) || 5
        });
        setWageSettingsModal(prev => ({ ...prev, isOpen: false }));
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
          const earningsMap = {}; 
          const prepNames = [];
          const sellNames = [];
          const undoItems = [];

          wageForm.prepPartners.forEach(id => {
              earningsMap[id] = (earningsMap[id] || 0) + prepPerPerson;
              const p = partners.find(x => x.id === id);
              if(p) prepNames.push(p.name);
          });
          wageForm.sellPartners.forEach(id => {
              earningsMap[id] = (earningsMap[id] || 0) + sellPerPerson;
              const p = partners.find(x => x.id === id);
              if(p) sellNames.push(p.name);
          });

          Object.keys(earningsMap).forEach(partnerId => {
              const partner = partners.find(p => p.id === partnerId);
              if (partner) {
                  const newWage = (partner.pendingWage || 0) + earningsMap[partnerId];
                  batch.update(doc(db, 'accounting_partners', partnerId), { pendingWage: newWage });
                  undoItems.push({ col: 'accounting_partners', docId: partnerId, oldData: partner, newData: {...partner, pendingWage: newWage} });
              }
          });

          const logRef = doc(collection(db, 'accounting_wage_logs'));
          const logData = {
              logType: 'boxes', date: wageForm.date, boxes,
              prepRate: wageSettings.prepRate || 0, sellRate: wageSettings.sellRate || 0,
              prepTotal, sellTotal, prepNames, sellNames, createdAt: serverTimestamp()
          };
          batch.set(logRef, logData);
          undoItems.push({ col: 'accounting_wage_logs', docId: logRef.id, oldData: null, newData: logData });

          await batch.commit();
          recordAction({ type: 'batch', items: undoItems });
          
          setWageForm({ date: new Date().toISOString().split('T')[0], boxes: '', prepPartners: [], sellPartners: [] });
      } catch (err) { alert('เกิดข้อผิดพลาด: ' + err.message); }
  };

  const handleDeliveryTripChange = (partnerId, valueStr) => {
     const value = parseInt(valueStr) || 0;
     const totalTrips = Number(deliveryForm.totalTrips) || 0;
     let sumOthers = 0;
     Object.keys(deliveryForm.tripsByPartner).forEach(id => {
         if (id !== partnerId) sumOthers += (deliveryForm.tripsByPartner[id] || 0);
     });
     if (sumOthers + value > totalTrips) return; 
     setDeliveryForm(prev => ({ ...prev, tripsByPartner: { ...prev.tripsByPartner, [partnerId]: value } }));
  };

  const handleCalculateDelivery = async () => {
     if (!user || !db || !isAdmin) return;
     const totalTrips = Number(deliveryForm.totalTrips);
     if (!totalTrips || totalTrips <= 0) return alert('กรุณาระบุรอบส่งรวมให้ถูกต้อง');
     
     const assignedTrips = Object.values(deliveryForm.tripsByPartner).reduce((a,b)=>a+b, 0);
     if (assignedTrips !== totalTrips) return alert(`กระจายรอบส่งยังไม่ครบ (ขาดอีก ${totalTrips - assignedTrips} รอบ)`);

     const rate = wageSettings.deliveryRate || 0;
     const totalAmount = totalTrips * rate;

     if (!window.confirm(`ยืนยันการคำนวณค่าส่ง?\nรวม ${totalTrips} รอบ (฿${totalAmount})`)) return;

     try {
         const batch = writeBatch(db);
         const undoItems = [];
         const deliveryNames = [];
         const deliveryDetails = [];

         Object.keys(deliveryForm.tripsByPartner).forEach(partnerId => {
             const trips = deliveryForm.tripsByPartner[partnerId];
             if (trips > 0) {
                 const partner = partners.find(p => p.id === partnerId);
                 if (partner) {
                     const earned = trips * rate;
                     const newWage = (partner.pendingWage || 0) + earned;
                     batch.update(doc(db, 'accounting_partners', partnerId), { pendingWage: newWage });
                     undoItems.push({ col: 'accounting_partners', docId: partnerId, oldData: partner, newData: {...partner, pendingWage: newWage} });
                     deliveryNames.push(partner.name);
                     deliveryDetails.push({ name: partner.name, trips, amount: earned });
                 }
             }
         });

         const logRef = doc(collection(db, 'accounting_wage_logs'));
         const logData = {
             logType: 'delivery', date: deliveryForm.date, totalTrips, deliveryRate: rate,
             totalAmount, deliveryNames, deliveryDetails, createdAt: serverTimestamp()
         };
         batch.set(logRef, logData);
         undoItems.push({ col: 'accounting_wage_logs', docId: logRef.id, oldData: null, newData: logData });

         await batch.commit();
         recordAction({ type: 'batch', items: undoItems });

         setDeliveryForm({ date: new Date().toISOString().split('T')[0], totalTrips: '', tripsByPartner: {} });
         setDeliverySelectModal(false);
     } catch (err) { alert('เกิดข้อผิดพลาด: ' + err.message); }
  };

  const handleCalculateElectricity = async () => {
    if (!user || !db || !isAdmin) return;
    const start = Number(elecForm.startMeter);
    const end = Number(elecForm.endMeter);
    const price = Number(elecForm.unitPrice) || Number(wageSettings.elecUnitPrice) || 0;

    if (end <= start) return alert('หน่วยไฟหลังทำต้องมากกว่าหน่วยก่อนทำ');
    if (price <= 0) return alert('กรุณาระบุราคาต่อหน่วยไฟ');
    if (!elecForm.providerId) return alert('กรุณาเลือกผู้รับเงินค่าไฟ/สถานที่');

    const units = end - start;
    const totalAmount = units * price;
    const partner = partners.find(p => p.id === elecForm.providerId);

    if (!window.confirm(`ยืนยันการคำนวณค่าไฟ?\nใช้ไป ${units} หน่วย x ${price} บาท\nรวม ฿${totalAmount} ให้กับ ${partner.name}`)) return;

    try {
        const batch = writeBatch(db);
        const undoItems = [];

        const newWage = (partner.pendingWage || 0) + totalAmount;
        batch.update(doc(db, 'accounting_partners', partner.id), { pendingWage: newWage });
        undoItems.push({ col: 'accounting_partners', docId: partner.id, oldData: partner, newData: {...partner, pendingWage: newWage} });

        const logRef = doc(collection(db, 'accounting_wage_logs'));
        const logData = {
            logType: 'electricity',
            date: elecForm.date,
            startMeter: start,
            endMeter: end,
            units: units,
            unitPrice: price,
            totalAmount: totalAmount,
            providerId: partner.id,
            providerName: partner.name,
            createdAt: serverTimestamp()
        };
        batch.set(logRef, logData);
        undoItems.push({ col: 'accounting_wage_logs', docId: logRef.id, oldData: null, newData: logData });

        await batch.commit();
        recordAction({ type: 'batch', items: undoItems });

        setElecForm(prev => ({ ...prev, startMeter: '', endMeter: '' }));
    } catch (err) { alert('Error: ' + err.message); }
  };

  const handleDeleteWageLog = async (log) => {
    if(!isAdmin) return;
    if(!window.confirm("ต้องการลบประวัติการคำนวณนี้ใช่หรือไม่?\n(ยอดที่แจกจ่ายไปแล้วจะไม่ถูกดึงกลับอัตโนมัติ)")) return;
    await deleteDoc(doc(db, 'accounting_wage_logs', log.id));
    recordAction({ type: 'single', col: 'accounting_wage_logs', docId: log.id, oldData: log, newData: null });
  };

  // ==========================================
  // Cost Profiles Handlers (ระบบคำนวณต้นทุน)
  // ==========================================
  const calcIngCostPerPiece = (ing, yieldPieces) => {
    const price = Number(ing.price) || 0;
    const qtyBought = Number(ing.qtyBought) || 1; 
    const usage = Number(ing.usage) || 0;
    const yPieces = Number(yieldPieces) || 1;
    const costPerUnit = price / qtyBought;
    if (ing.usageType === 'per_piece') return costPerUnit * usage;
    else return (costPerUnit * usage) / yPieces;
  };

  const calcElectCostPerPiece = (elec) => {
    if (!elec.enabled) return 0;
    const watts = Number(elec.watts) || 0;
    const unitPrice = Number(elec.unitPrice) || 0;
    const mins = Number(elec.minutes) || 0;
    const piecesPerBatch = Number(elec.piecesPerBatch) || 1; 
    const costPerBatch = (watts / 1000) * (mins / 60) * unitPrice;
    return costPerBatch / piecesPerBatch;
  };

  const generateCostSummary = (form) => {
    const yieldP = Number(form.yieldPieces) || 1;
    let totalIngCostPerPiece = 0;
    const ingDetails = form.ingredients.map(ing => {
        const c = calcIngCostPerPiece(ing, yieldP);
        totalIngCostPerPiece += c;
        return { ...ing, costPerPiece: c };
    });
    const elePerPiece = calcElectCostPerPiece(form.electricity);
    const totalPerPiece = totalIngCostPerPiece + elePerPiece;
    const boxP = Number(form.boxConfig.piecesPerBox) || 1;
    const packCost = Number(form.boxConfig.packagingCost) || 0;
    const labCost = Number(form.boxConfig.laborCost) || 0;
    const totalBoxCost = (totalPerPiece * boxP) + packCost + labCost;

    return { ingDetails, totalIngCostPerPiece, elePerPiece, totalPerPiece, totalBoxCost };
  };

  const handleCostFieldChange = (field, value) => setCostForm(prev => ({ ...prev, [field]: value }));
  const handleCostElectChange = (field, value) => setCostForm(prev => ({ ...prev, electricity: { ...prev.electricity, [field]: value } }));
  const handleCostBoxChange = (field, value) => setCostForm(prev => ({ ...prev, boxConfig: { ...prev.boxConfig, [field]: value } }));
  const handleCostIngredientChange = (id, field, value) => setCostForm(prev => ({ ...prev, ingredients: prev.ingredients.map(ing => ing.id === id ? { ...ing, [field]: value } : ing) }));
  
  const addCostIngredient = () => setCostForm(prev => ({ ...prev, ingredients: [...prev.ingredients, { id: Date.now(), name: '', price: '', qtyBought: '', unit: '', usage: '', usageType: 'per_recipe' }] }));
  const removeCostIngredient = (id) => setCostForm(prev => ({ ...prev, ingredients: prev.ingredients.filter(ing => ing.id !== id) }));

  const handleSaveCostProfile = async (e) => {
    e.preventDefault();
    if (!isAdmin || !db) return;
    if (!costForm.name.trim()) return alert("กรุณาตั้งชื่อสูตรต้นทุน");

    const summary = generateCostSummary(costForm);
    const payload = { ...costForm, summary, updatedAt: serverTimestamp() };

    try {
        if (costFormModal.mode === 'edit' && costFormModal.id) {
            const oldProfile = costProfiles.find(p => p.id === costFormModal.id);
            await updateDoc(doc(db, 'accounting_cost_profiles', costFormModal.id), payload);
            recordAction({ type: 'single', col: 'accounting_cost_profiles', docId: costFormModal.id, oldData: oldProfile, newData: payload });
        } else {
            payload.createdAt = serverTimestamp();
            const docRef = await addDoc(collection(db, 'accounting_cost_profiles'), payload);
            recordAction({ type: 'single', col: 'accounting_cost_profiles', docId: docRef.id, oldData: null, newData: payload });
        }
        setCostFormModal({ isOpen: false, mode: 'add', id: null });
    } catch (err) { alert("บันทึกต้นทุนล้มเหลว: " + err.message); }
  };

  const openEditCostProfile = (profile) => {
    if (!isAdmin) return;
    setCostForm({
        name: profile.name || '', yieldPieces: profile.yieldPieces || '', ingredients: profile.ingredients || [],
        electricity: profile.electricity || { enabled: false, watts: '', unitPrice: '5', minutes: '', piecesPerBatch: '' },
        boxConfig: profile.boxConfig || { piecesPerBox: '', packagingCost: '', laborCost: '' }
    });
    setCostFormModal({ isOpen: true, mode: 'edit', id: profile.id });
  };
  
  const handleDuplicateCostProfile = (profile) => {
    if (!isAdmin) return;
    setCostForm({
        name: `${profile.name} (สำเนา)`,
        yieldPieces: profile.yieldPieces || '',
        ingredients: profile.ingredients?.map(ing => ({ ...ing, id: Date.now() + Math.random() })) || [],
        electricity: profile.electricity || { enabled: false, watts: '', unitPrice: '5', minutes: '', piecesPerBatch: '' },
        boxConfig: profile.boxConfig || { piecesPerBox: '', packagingCost: '', laborCost: '' }
    });
    setCostFormModal({ isOpen: true, mode: 'add', id: null });
  };

  const handleDeleteCostProfile = async (profileId, profileData) => {
    if (!isAdmin || !db) return;
    if (!window.confirm("ต้องการลบสูตรต้นทุนนี้ใช่หรือไม่?")) return;
    try {
        await deleteDoc(doc(db, 'accounting_cost_profiles', profileId));
        recordAction({ type: 'single', col: 'accounting_cost_profiles', docId: profileId, oldData: profileData, newData: null });
        setCostDetailsModal({ isOpen: false, profile: null });
    } catch (err) { alert("ลบล้มเหลว: " + err.message); }
  };

  // ==========================================
  // Filter Toggle Categories logic
  // ==========================================
  const toggleFilterCategory = (cat) => {
      setFilterCategories(prev => {
          if (prev.includes(cat)) return prev.filter(c => c !== cat);
          return [...prev, cat];
      });
  };

  // ==========================================
  // Computations
  // ==========================================
  
  const filteredRecords = records.filter(record => {
    let matchDate = true;
    if (filterStartDate && filterEndDate) {
      matchDate = record.date >= filterStartDate && record.date <= filterEndDate;
    } else if (filterStartDate) {
      matchDate = record.date >= filterStartDate;
    } else if (filterEndDate) {
      matchDate = record.date <= filterEndDate;
    }
    const matchCategory = filterCategories.length > 0 ? filterCategories.includes(record.category) : true;
    return matchDate && matchCategory;
  });

  const filteredWageLogs = wageHistory.filter(log => {
    let matchDate = true;
    if (filterStartDate && filterEndDate) matchDate = log.date >= filterStartDate && log.date <= filterEndDate;
    else if (filterStartDate) matchDate = log.date >= filterStartDate;
    else if (filterEndDate) matchDate = log.date <= filterEndDate;
    return matchDate;
  });

  const totals = filteredRecords.reduce((acc, curr) => {
    if (curr.type === 'income') acc.income += curr.amount;
    if (curr.type === 'expense') acc.expense += curr.amount;
    return acc;
  }, { income: 0, expense: 0 });
  
  const balance = totals.income - totals.expense;
  
  const globalPendingWages = partners.reduce((sum, p) => sum + (Number(p.pendingWage) || 0), 0);
  let displayPendingWages = globalPendingWages;

  if (syncWageFilter && (filterStartDate || filterEndDate)) {
      const earnedInPeriod = filteredWageLogs.reduce((sum, log) => {
          if (log.logType === 'delivery') return sum + (Number(log.totalAmount) || 0);
          if (log.logType === 'electricity') return sum + (Number(log.totalAmount) || 0);
          return sum + (Number(log.prepTotal) || 0) + (Number(log.sellTotal) || 0) + (Number(log.elecCost) || 0);
      }, 0);
      
      const paidInPeriod = filteredRecords.reduce((sum, r) => {
          if (r.type === 'expense' && r.category === 'ค่าแรง') return sum + Number(r.amount);
          return sum;
      }, 0);
      
      displayPendingWages = earnedInPeriod - paidInPeriod;
  }

  const netProfitLoss = balance - Number(shopCapital || 0) - displayPendingWages;
  const dividendPerPerson = partners.length > 0 ? (netProfitLoss / partners.length) : 0;

  const getChartData = () => {
     const chartDataMap = {};
     filteredRecords.forEach(r => {
        if (!chartDataMap[r.date]) chartDataMap[r.date] = { date: r.date, income: 0, expense: 0 };
        if (r.type === 'income') chartDataMap[r.date].income += Number(r.amount);
        if (r.type === 'expense') chartDataMap[r.date].expense += Number(r.amount);
     });

     const sortedChartData = Object.values(chartDataMap).sort((a, b) => a.date.localeCompare(b.date));
     let runningCumulative = 0;
     
     return sortedChartData.map(d => {
        const net = d.income - d.expense;
        runningCumulative += net;
        return {
           ...d,
           net,
           cumulative: runningCumulative,
           displayDate: new Date(d.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
        };
     });
  };
  const chartData = getChartData();

  const getPartnerStatement = (partner) => {
      if (!partner) return [];
      let stmts = [];
      wageHistory.forEach(log => {
          if (log.logType === 'delivery') {
              const d = log.deliveryDetails?.find(x => x.name === partner.name);
              if (d) stmts.push({ date: log.date, text: `ค่าจัดส่ง (${d.trips} รอบ)`, amount: d.amount, isIncome: true, realDate: log.createdAt });
          } else if (log.logType === 'electricity') {
              if (log.providerId === partner.id) {
                 stmts.push({ date: log.date, text: `ค่าสถานที่/ค่าไฟ (${log.units} หน่วย)`, amount: log.totalAmount, isIncome: true, realDate: log.createdAt });
              }
          } else {
              let amount = 0; let text = [];
              if (log.prepNames?.includes(partner.name)) { amount += log.prepTotal / log.prepNames.length; text.push('ทำไก่'); }
              if (log.sellNames?.includes(partner.name)) { amount += log.sellTotal / log.sellNames.length; text.push('ขายไก่'); }
              if (amount > 0) stmts.push({ date: log.date, text: `ค่าแรง: ${text.join(' + ')} (ยอดขาย ${log.boxes} กล่อง)`, amount, isIncome: true, realDate: log.createdAt });
              
              if (log.elecProviderName === partner.name && log.elecCost > 0) {
                 stmts.push({ date: log.date, text: `ค่าสถานที่/ค่าไฟ (${log.boxes} กล่อง)`, amount: log.elecCost, isIncome: true, realDate: log.createdAt });
              }
          }
      });
      records.forEach(r => {
          if (r.note === `จ่ายค่าแรง: ${partner.name}` || r.note.includes(partner.name)) {
              if (r.type === 'expense' && r.category === 'ค่าแรง') {
                  stmts.push({ date: r.date, text: 'เบิกจ่ายค่าแรงแล้ว', amount: r.amount, isIncome: false, realDate: r.createdAt });
              }
          }
      });
      stmts.sort((a,b) => {
         const dA = a.realDate?.toMillis ? a.realDate.toMillis() : new Date(a.date).getTime();
         const dB = b.realDate?.toMillis ? b.realDate.toMillis() : new Date(b.date).getTime();
         return dB - dA;
      });
      return stmts;
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center font-sans text-gray-500 bg-gray-50">กำลังโหลดระบบบัญชี...</div>;

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900 pb-20 relative">
      {/* Background layer for closing dropdowns */}
      {isCategoryDropdownOpen && (
          <div className="fixed inset-0 z-10" onClick={() => setIsCategoryDropdownOpen(false)}></div>
      )}

      {/* Header */}
      <div className="bg-blue-600 text-white p-4 shadow-md sticky top-0 z-20 transition-all duration-300">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          
          <h1 className="text-lg md:text-xl font-bold flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="flex items-center gap-2">
              <Wallet className="w-6 h-6" /> ระบบบัญชี
            </span>
            {!isAdmin && <span className="bg-white/20 text-white text-xs px-3 py-1 rounded-full font-medium tracking-wide border border-white/10 shadow-sm">โหมดผู้เยี่ยมชม</span>}
            {isAdmin && <span className="bg-green-400 text-white text-xs px-3 py-1 rounded-full font-medium shadow-sm tracking-wide">โหมดแอดมิน</span>}
          </h1>
          
          <div className="w-full sm:w-auto flex justify-end gap-2">
            {isAdmin && (
              <>
                <button onClick={handleUndo} disabled={undoStack.length === 0} className={`p-1.5 md:p-2 rounded-md flex items-center transition-all duration-200 active:scale-[0.95] ${undoStack.length > 0 ? 'bg-blue-700 text-white hover:bg-blue-800 hover:shadow-sm' : 'bg-blue-500 text-blue-400 cursor-not-allowed'}`} title="ย้อนกลับ (Undo)">
                  <Undo size={16} />
                </button>
                <button onClick={handleRedo} disabled={redoStack.length === 0} className={`p-1.5 md:p-2 rounded-md flex items-center transition-all duration-200 active:scale-[0.95] mr-1 ${redoStack.length > 0 ? 'bg-blue-700 text-white hover:bg-blue-800 hover:shadow-sm' : 'bg-blue-500 text-blue-400 cursor-not-allowed'}`} title="ทำซ้ำ (Redo)">
                  <Redo size={16} />
                </button>
              </>
            )}
            {!isAdmin ? (
              <button onClick={() => setShowLoginModal(true)} className="flex items-center gap-1.5 bg-gray-900 hover:bg-black text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 active:scale-[0.97] shadow-sm">
                 <Lock size={14} /> เข้าระบบแก้ไข
              </button>
            ) : (
              <button onClick={handleLogout} className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white border border-white/30 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 active:scale-[0.97]">
                 <LogOut size={14} /> ออกจากระบบ
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-3 md:p-6 space-y-4 md:space-y-6">
        
        {/* Dashboard */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="bg-white p-4 rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 border-l-4 border-green-500 flex flex-col justify-between items-center text-center">
            <p className="text-xs md:text-sm text-gray-500 font-medium">รายรับรวม</p>
            <p className="text-lg md:text-2xl font-bold text-green-600">฿{totals.income.toLocaleString()}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 border-l-4 border-rose-500 flex flex-col justify-between items-center text-center">
            <p className="text-xs md:text-sm text-gray-500 font-medium">รายจ่ายรวม</p>
            <p className="text-lg md:text-2xl font-bold text-rose-600">฿{totals.expense.toLocaleString()}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 border-l-4 border-blue-500 flex flex-col justify-between items-center text-center col-span-2 md:col-span-1">
            <p className="text-xs md:text-sm text-gray-500 font-medium">ยอดคงเหลือสุทธิ</p>
            <p className="text-lg md:text-2xl font-bold text-blue-600">฿{balance.toLocaleString()}</p>
          </div>

          <div className="bg-white p-4 rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 border-l-4 border-purple-500 flex flex-col justify-between items-center text-center">
            <p className="text-xs md:text-sm text-gray-500 font-medium w-full mb-1">มูลค่าทุนร้าน</p>
            <div className="flex items-center justify-center w-full transition-all duration-300">
              <span className="text-lg md:text-2xl font-bold text-purple-600 mr-1">฿</span>
              {isAdmin ? (
                <input 
                  type="number" min="0" step="any"
                  value={shopCapital}
                  onChange={(e) => setShopCapital(e.target.value === '' ? '' : Number(e.target.value))}
                  onBlur={(e) => handleCapitalUpdate(e.target.value)}
                  className="text-lg md:text-2xl font-bold text-purple-600 bg-transparent outline-none w-24 md:w-32 text-center border-b border-dashed border-gray-300 focus:border-purple-500 transition-colors duration-300"
                  placeholder="0"
                />
              ) : (
                <span className="text-lg md:text-2xl font-bold text-purple-600">{Number(shopCapital).toLocaleString()}</span>
              )}
            </div>
          </div>
          <div className={`bg-white p-4 rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 border-l-4 ${syncWageFilter ? 'border-indigo-500 bg-indigo-50/20' : 'border-orange-500'} flex flex-col justify-between items-center text-center`}>
            <p className="text-xs md:text-sm text-gray-500 font-medium">{syncWageFilter ? 'ค่าแรงรอจ่าย (ช่วงนี้)' : 'ค่าแรงรอจ่ายรวม'}</p>
            <p className={`text-lg md:text-2xl font-bold ${syncWageFilter ? 'text-indigo-600' : 'text-orange-600'}`}>฿{displayPendingWages.toLocaleString()}</p>
          </div>
          <div className={`bg-white p-4 rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 border-l-4 ${netProfitLoss >= 0 ? 'border-teal-500' : 'border-red-600'} flex flex-col justify-between items-center text-center col-span-2 md:col-span-1`}>
            <p className="text-xs md:text-sm text-gray-500 font-medium">สถานะร้าน (กำไร/ขาดทุน)</p>
            <p className={`text-lg md:text-2xl font-bold ${netProfitLoss >= 0 ? 'text-teal-600' : 'text-red-600'}`}>
              {netProfitLoss >= 0 ? '+' : ''}฿{netProfitLoss.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 2})}
            </p>
          </div>
        </div>

        {/* ==================================================== */}
        {/* กราฟผลประกอบการ (Stock Line Chart) */}
        {/* ==================================================== */}
        <div className="bg-white rounded-2xl shadow-sm border border-blue-100 overflow-hidden transition-all duration-300 mt-2">
          <button onClick={() => setIsChartOpen(!isChartOpen)} className="w-full p-4 bg-blue-50/40 hover:bg-blue-50/80 border-b border-blue-50 flex justify-between items-center transition-colors duration-200">
            <div className="flex items-center gap-2">
               <TrendingUp className="w-5 h-5 text-blue-500" />
               <h3 className="font-semibold text-blue-800">กราฟแนวโน้มกำไรสะสมสุทธิ</h3>
            </div>
            <div className="flex items-center gap-2">
               <ChevronDown className={`w-5 h-5 text-blue-400 transition-transform duration-300 ease-out ${isChartOpen ? 'rotate-180' : ''}`} />
            </div>
          </button>
          
          <div className={`overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${isChartOpen ? 'h-[240px] opacity-100' : 'h-0 opacity-0'}`}>
             <ProfitChart data={chartData} />
          </div>
        </div>

        {/* ระบบ Face Card ID หุ้นส่วน / จ่ายค่าแรง */}
        <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-gray-200 transition-all duration-300">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
              <h2 className="text-base md:text-lg font-semibold text-gray-800 flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-500" /> จัดการค่าแรง / หุ้นส่วน
              </h2>
              {isAdmin && (
                <button 
                  onClick={() => setPartnerModal({ isOpen: true, mode: 'add', data: null, value: '' })}
                  className="flex items-center gap-1.5 text-sm bg-blue-50 text-blue-600 border border-blue-200 px-3 py-1.5 rounded-xl hover:bg-blue-100 transition-all duration-200 active:scale-[0.96] w-full sm:w-auto justify-center"
                >
                  <UserPlus className="w-4 h-4" /> เพิ่มรายชื่อ
                </button>
              )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {partners.length === 0 ? (
               <div className="col-span-full p-6 text-center text-gray-400 bg-gray-50 rounded-2xl border border-dashed border-gray-200">ยังไม่มีรายชื่อ</div>
            ) : (
              partners.map((partner) => {
                const totalAmount = (partner.pendingWage || 0) + dividendPerPerson;

                return (
                <div key={partner.id} className="border border-gray-200 rounded-2xl p-4 flex flex-col items-center justify-center gap-3 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 bg-white relative group">
                  <button 
                     onClick={() => setPartnerDetailsModal({ isOpen: true, partner })} 
                     className="absolute top-2 right-2 text-blue-300 hover:text-blue-600 transition-all duration-200 p-1 active:scale-90"
                     title="ดูรายละเอียดการได้เงิน"
                  >
                     <Info className="w-5 h-5" />
                  </button>

                  <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center shadow-inner mt-2 shrink-0 transition-transform duration-300 group-hover:scale-105">
                    <Users className="w-6 h-6 text-gray-500" />
                  </div>
                  
                  <div className="text-center w-full mt-1">
                      <span className="font-bold text-gray-800 text-sm block truncate">{partner.name}</span>
                      
                      <div className="bg-gray-50 rounded-xl p-2 mt-2 border border-gray-100 w-full text-left transition-colors duration-300 group-hover:bg-blue-50/50">
                          <div className="flex justify-between items-center text-[11px] md:text-xs mb-1">
                              <span className="text-gray-500">ค่าแรงรอจ่าย:</span>
                              <span className={`font-semibold ${partner.pendingWage > 0 ? 'text-orange-500' : 'text-gray-400'}`}>
                                  ฿{(partner.pendingWage || 0).toLocaleString()}
                              </span>
                          </div>
                          <div className="flex justify-between items-center text-[11px] md:text-xs mb-1">
                              <span className="text-gray-500">ปันผลเฉลี่ย:</span>
                              <span className={`font-semibold ${dividendPerPerson > 0 ? 'text-teal-600' : dividendPerPerson < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                                  {dividendPerPerson > 0 ? '+' : ''}฿{dividendPerPerson.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 2})}
                              </span>
                          </div>
                          <div className="flex justify-between items-center text-[11px] md:text-xs pt-1.5 mt-1.5 border-t border-gray-200">
                              <span className="font-bold text-gray-700">รวมสุทธิ:</span>
                              <span className={`font-bold ${totalAmount > 0 ? 'text-blue-600' : totalAmount < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                                  ฿{totalAmount.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 2})}
                              </span>
                          </div>
                      </div>
                  </div>
                  
                  {isAdmin && (
                    <div className="w-full flex flex-col gap-2 mt-1">
                        <button 
                          onClick={() => setPartnerModal({ isOpen: true, mode: 'setWage', data: partner, value: partner.pendingWage || '' })}
                          className="flex items-center justify-center gap-1.5 w-full bg-white text-gray-600 border border-gray-200 py-1.5 rounded-md text-xs font-medium hover:bg-gray-50 active:scale-[0.97] transition-all duration-200 shadow-sm"
                        >
                          <Settings className="w-3.5 h-3.5" /> ตั้งยอดค่าแรง
                        </button>
                        <button 
                          onClick={() => handlePayWage(partner)}
                          disabled={!partner.pendingWage || partner.pendingWage <= 0}
                          className="flex items-center justify-center gap-1.5 w-full bg-blue-50 text-blue-600 border border-blue-200 py-1.5 rounded-md text-xs font-bold hover:bg-blue-600 hover:text-white active:scale-[0.97] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 shadow-sm"
                        >
                          <Banknote className="w-4 h-4" /> จ่ายเงินตัดบัญชี
                        </button>
                    </div>
                  )}
                </div>
              )})
            )}
          </div>
        </div>

        {/* ฟังก์ชันคำนวณค่าแรงแบบแอดวานซ์ (แสดงเฉพาะ Admin) */}
        {isAdmin && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            
            {/* 1. กล่องทำไก่/ขายไก่ */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-orange-200 bg-gradient-to-br from-white to-orange-50/30 transition-all duration-300 flex flex-col h-full">
              <div className="flex justify-between items-center mb-3 border-b border-orange-100 pb-2 shrink-0">
                <h2 className="text-sm md:text-base font-semibold text-orange-800 flex items-center gap-1.5">
                  <Calculator className="w-4 h-4" /> ค่าแรงยอดขาย (กล่อง)
                </h2>
                <button onClick={() => setWageSettingsModal({ isOpen: true, prepRate: wageSettings.prepRate, sellRate: wageSettings.sellRate, deliveryRate: wageSettings.deliveryRate, elecUnitPrice: wageSettings.elecUnitPrice })} className="text-orange-600 hover:text-orange-800 bg-orange-100 hover:bg-orange-200 active:scale-90 p-1.5 rounded-lg transition-all duration-200" title="ตั้งค่าเรท">
                  <Settings className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 flex flex-col">
                <div className="space-y-3 mb-3">
                  <div className="flex gap-2">
                     <div className="w-1/2 relative">
                        <span className="absolute -top-2.5 left-3 bg-white px-1 text-[10px] font-semibold text-orange-600 z-10">วันที่</span>
                        <input type="date" value={wageForm.date} onChange={e => setWageForm({...wageForm, date: e.target.value})} onClick={(e) => { try { e.target.showPicker() } catch(err){} }} className="w-full p-3 h-[52px] appearance-none text-left block border border-orange-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-sm bg-white transition-all duration-200" />
                     </div>
                     <div className="w-1/2 relative">
                        <span className="absolute -top-2.5 left-3 bg-white px-1 text-[10px] font-semibold text-orange-600 z-10">จำนวนกล่อง</span>
                        <input type="number" min="0" placeholder="0" value={wageForm.boxes} onChange={e => setWageForm({...wageForm, boxes: e.target.value})} className="w-full p-3 h-[52px] appearance-none text-left block border border-orange-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-sm bg-white font-bold text-orange-600 transition-all duration-200" />
                     </div>
                  </div>
                  <div className="flex gap-2">
                     <button type="button" onClick={() => setPartnerSelectModal({ isOpen: true, type: 'prep' })} className={`w-1/2 p-2 min-h-[52px] border rounded-xl text-sm flex flex-col items-center justify-center active:scale-[0.97] transition-all duration-200 shadow-sm ${wageForm.prepPartners.length > 0 ? 'bg-orange-100 border-orange-300 text-orange-800' : 'bg-white border-orange-200 text-gray-500 hover:bg-orange-50'}`}>
                       <span className="flex items-center gap-1"><ChefHat className="w-3.5 h-3.5"/> ทำไก่</span>
                       <span className="font-bold">{wageForm.prepPartners.length} คน</span>
                     </button>
                     <button type="button" onClick={() => setPartnerSelectModal({ isOpen: true, type: 'sell' })} className={`w-1/2 p-2 min-h-[52px] border rounded-xl text-sm flex flex-col items-center justify-center active:scale-[0.97] transition-all duration-200 shadow-sm ${wageForm.sellPartners.length > 0 ? 'bg-orange-100 border-orange-300 text-orange-800' : 'bg-white border-orange-200 text-gray-500 hover:bg-orange-50'}`}>
                       <span className="flex items-center gap-1"><ShoppingBag className="w-3.5 h-3.5"/> ขายไก่</span>
                       <span className="font-bold">{wageForm.sellPartners.length} คน</span>
                     </button>
                  </div>
                </div>
                <button onClick={handleCalculateWages} className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl text-sm active:scale-[0.98] transition-all duration-200 shadow-md mt-auto">
                  คำนวณและแจกจ่าย
                </button>
              </div>
            </div>

            {/* 2. กล่องจัดส่ง */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-purple-200 bg-gradient-to-br from-white to-purple-50/30 transition-all duration-300 flex flex-col h-full">
              <div className="flex justify-between items-center mb-3 border-b border-purple-100 pb-2 shrink-0">
                <h2 className="text-sm md:text-base font-semibold text-purple-800 flex items-center gap-1.5">
                  <Truck className="w-4 h-4" /> ค่าแรงจัดส่ง (รอบ)
                </h2>
                <button onClick={() => setWageSettingsModal({ isOpen: true, prepRate: wageSettings.prepRate, sellRate: wageSettings.sellRate, deliveryRate: wageSettings.deliveryRate, elecUnitPrice: wageSettings.elecUnitPrice })} className="text-purple-600 hover:text-purple-800 bg-purple-100 hover:bg-purple-200 active:scale-90 p-1.5 rounded-lg transition-all duration-200" title="ตั้งค่าเรท">
                  <Settings className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 flex flex-col">
                <div className="space-y-3 mb-3">
                  <div className="flex gap-2">
                     <div className="w-1/2 relative">
                        <span className="absolute -top-2.5 left-3 bg-white px-1 text-[10px] font-semibold text-purple-600 z-10">วันที่</span>
                        <input type="date" value={deliveryForm.date} onChange={e => setDeliveryForm({...deliveryForm, date: e.target.value})} onClick={(e) => { try { e.target.showPicker() } catch(err){} }} className="w-full p-3 h-[52px] appearance-none text-left block border border-purple-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-sm bg-white transition-all duration-200" />
                     </div>
                     <div className="w-1/2 relative">
                        <span className="absolute -top-2.5 left-3 bg-white px-1 text-[10px] font-semibold text-purple-600 z-10">จำนวนรอบรวม</span>
                        <input type="number" min="0" placeholder="0" value={deliveryForm.totalTrips} onChange={e => setDeliveryForm({...deliveryForm, totalTrips: e.target.value})} className="w-full p-3 h-[52px] appearance-none text-left block border border-purple-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-sm bg-white font-bold text-purple-600 transition-all duration-200" />
                     </div>
                  </div>
                  <button type="button" onClick={() => setDeliverySelectModal({ isOpen: true })} className={`w-full p-3 h-[52px] border rounded-xl text-sm flex items-center justify-between active:scale-[0.98] transition-all duration-200 shadow-sm ${Object.values(deliveryForm.tripsByPartner).reduce((a,b)=>a+b,0) > 0 ? 'bg-purple-100 border-purple-300 text-purple-800' : 'bg-white border-purple-200 text-gray-500 hover:bg-purple-50'}`}>
                    <span className="flex items-center gap-1"><Users className="w-4 h-4"/> เลือกคนส่งของ</span>
                    <span className="font-bold">{Object.values(deliveryForm.tripsByPartner).reduce((a,b)=>a+b,0)} / {deliveryForm.totalTrips || 0} รอบ</span>
                  </button>
                </div>
                <button onClick={handleCalculateDelivery} className="w-full bg-purple-500 hover:bg-purple-600 text-white font-bold py-3 rounded-xl text-sm active:scale-[0.98] transition-all duration-200 shadow-md mt-auto">
                  คำนวณและแจกจ่าย
                </button>
              </div>
            </div>

            {/* 3. กล่องค่าไฟ/สถานที่ (NEW) */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-yellow-200 bg-gradient-to-br from-white to-yellow-50/30 transition-all duration-300 flex flex-col h-full lg:col-span-2 xl:col-span-1">
              <div className="flex justify-between items-center mb-3 border-b border-yellow-100 pb-2 shrink-0">
                <h2 className="text-sm md:text-base font-semibold text-yellow-800 flex items-center gap-1.5">
                  <Zap className="w-4 h-4" /> คำนวณค่าไฟ/สถานที่
                </h2>
                <button onClick={() => setWageSettingsModal({ isOpen: true, prepRate: wageSettings.prepRate, sellRate: wageSettings.sellRate, deliveryRate: wageSettings.deliveryRate, elecUnitPrice: wageSettings.elecUnitPrice })} className="text-yellow-600 hover:text-yellow-800 bg-yellow-100 hover:bg-yellow-200 active:scale-90 p-1.5 rounded-lg transition-all duration-200" title="ตั้งค่าเรท">
                  <Settings className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 flex flex-col">
                <div className="space-y-3 mb-3">
                  <div className="flex gap-2">
                     <div className="w-1/2 relative">
                        <span className="absolute -top-2.5 left-3 bg-white px-1 text-[10px] font-semibold text-yellow-600 z-10">วันที่</span>
                        <input type="date" value={elecForm.date} onChange={e => setElecForm({...elecForm, date: e.target.value})} onClick={(e) => { try { e.target.showPicker() } catch(err){} }} className="w-full p-3 h-[52px] appearance-none text-left block border border-yellow-200 rounded-xl focus:ring-2 focus:ring-yellow-500 outline-none text-sm bg-white transition-all duration-200" />
                     </div>
                     <div className="w-1/2 relative">
                        <span className="absolute -top-2.5 left-3 bg-white px-1 text-[10px] font-semibold text-yellow-600 z-10">ค่าไฟ (บาท/หน่วย)</span>
                        <input type="number" min="0" step="any" value={elecForm.unitPrice !== '' ? elecForm.unitPrice : (wageSettings.elecUnitPrice || '')} onChange={e => setElecForm({...elecForm, unitPrice: e.target.value})} className="w-full p-3 h-[52px] appearance-none text-left block border border-yellow-200 rounded-xl focus:ring-2 focus:ring-yellow-500 outline-none text-sm bg-white font-bold text-yellow-600 transition-all duration-200" placeholder="0" />
                     </div>
                  </div>
                  <div className="flex gap-2">
                     <div className="w-1/2 relative">
                        <span className="absolute -top-2.5 left-3 bg-white px-1 text-[10px] font-semibold text-yellow-600 z-10">มิเตอร์ (ก่อน)</span>
                        <input type="number" min="0" step="any" value={elecForm.startMeter} onChange={e => setElecForm({...elecForm, startMeter: e.target.value})} className="w-full p-3 h-[52px] appearance-none text-left block border border-yellow-200 rounded-xl focus:ring-2 focus:ring-yellow-500 outline-none text-sm bg-white transition-all duration-200" placeholder="0" />
                     </div>
                     <div className="w-1/2 relative">
                        <span className="absolute -top-2.5 left-3 bg-white px-1 text-[10px] font-semibold text-yellow-600 z-10">มิเตอร์ (หลัง)</span>
                        <input type="number" min="0" step="any" value={elecForm.endMeter} onChange={e => setElecForm({...elecForm, endMeter: e.target.value})} className="w-full p-3 h-[52px] appearance-none text-left block border border-yellow-200 rounded-xl focus:ring-2 focus:ring-yellow-500 outline-none text-sm bg-white transition-all duration-200" placeholder="0" />
                     </div>
                  </div>
                  <div className="relative">
                     <span className="absolute -top-2.5 left-3 bg-white px-1 text-[10px] font-semibold text-yellow-600 z-10">โอนค่าไฟให้ใคร?</span>
                     <select value={elecForm.providerId} onChange={e => setElecForm({...elecForm, providerId: e.target.value})} className="w-full p-3 h-[52px] appearance-none text-left block border border-yellow-200 rounded-xl focus:ring-2 focus:ring-yellow-500 outline-none text-sm bg-white transition-all duration-200">
                        <option value="">-- เลือกผู้รับเงิน --</option>
                        {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                     </select>
                  </div>
                  {/* แสดงยอดเรียลไทม์ */}
                  {Number(elecForm.endMeter) > Number(elecForm.startMeter) && (elecForm.unitPrice !== '' || wageSettings.elecUnitPrice) && (
                     <div className="text-center text-xs font-medium text-yellow-700 bg-yellow-50 p-2 rounded-lg border border-yellow-100">
                        ใช้ไป <span className="font-bold">{(Number(elecForm.endMeter) - Number(elecForm.startMeter)).toFixed(2)}</span> หน่วย = <span className="font-bold text-sm">฿{((Number(elecForm.endMeter) - Number(elecForm.startMeter)) * (Number(elecForm.unitPrice) || Number(wageSettings.elecUnitPrice) || 0)).toFixed(2)}</span>
                     </div>
                  )}
                </div>
                <button onClick={handleCalculateElectricity} className="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-3 rounded-xl text-sm active:scale-[0.98] transition-all duration-200 shadow-md mt-auto flex items-center justify-center gap-1.5">
                  <Check className="w-4 h-4"/> บันทึกและแจกจ่าย
                </button>
              </div>
            </div>

          </div>
        )}

        {/* Input Form บัญชีหลัก (ซ่อนถ้าไม่ใช่ Admin) */}
        {isAdmin && (
          <div id="record-form" className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-gray-200 animate-in fade-in duration-500 mt-6">
            <h2 className="text-base md:text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              {editingId ? <Edit2 className="w-5 h-5 text-yellow-500" /> : <PlusCircle className="w-5 h-5 text-blue-500" />}
              {editingId ? 'แก้ไขรายการบัญชี' : 'บันทึกรายการบัญชีกองกลาง'}
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-4 md:space-y-5">
              <div className="grid grid-cols-2 gap-3 md:gap-4">
                <button type="button" onClick={() => handleInputChange({ target: { name: 'type', value: 'income' } })} className={`py-3.5 rounded-xl font-bold flex justify-center items-center gap-2 active:scale-[0.98] transition-all duration-200 ${formData.type === 'income' ? 'bg-green-500 text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                  <PlusCircle className="w-5 h-5" /> รายรับ
                </button>
                <button type="button" onClick={() => handleInputChange({ target: { name: 'type', value: 'expense' } })} className={`py-3.5 rounded-xl font-bold flex justify-center items-center gap-2 active:scale-[0.98] transition-all duration-200 ${formData.type === 'expense' ? 'bg-red-500 text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                  <MinusCircle className="w-5 h-5" /> รายจ่าย
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                <div className="relative">
                  <span className="absolute -top-2.5 left-3 bg-white px-1 text-[10px] font-semibold text-gray-500 z-10">จำนวนเงิน (บาท)*</span>
                  <input type="number" name="amount" min="0" step="any" value={formData.amount} onChange={handleInputChange} className="w-full p-3 h-[52px] appearance-none text-left block border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900 shadow-sm transition-all duration-200" placeholder="0.00" />
                </div>
                <div className="relative">
                  <span className="absolute -top-2.5 left-3 bg-white px-1 text-[10px] font-semibold text-gray-500 z-10">หมวดหมู่*</span>
                  <select name="category" value={formData.category} onChange={handleInputChange} className="w-full p-3 h-[52px] appearance-none text-left block border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900 shadow-sm transition-all duration-200">
                    <option value="" disabled>-- เลือกหมวดหมู่ --</option>
                    {categories.income.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    {categories.expense.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
                <div className="relative">
                  <span className="absolute -top-2.5 left-3 bg-white px-1 text-[10px] font-semibold text-gray-500 z-10">วันที่*</span>
                  <input type="date" name="date" value={formData.date} onChange={handleInputChange} onClick={(e) => { try { e.target.showPicker() } catch(err){} }} className="w-full p-3 h-[52px] appearance-none text-left block border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900 shadow-sm transition-all duration-200" />
                </div>
                <div className="relative">
                  <span className="absolute -top-2.5 left-3 bg-white px-1 text-[10px] font-semibold text-gray-500 z-10">หมายเหตุ</span>
                  <input type="text" name="note" value={formData.note} onChange={handleInputChange} className="w-full p-3 h-[52px] appearance-none text-left block border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900 shadow-sm transition-all duration-200" placeholder="ระบุเพิ่มเติม..." />
                </div>
                
                {/* ระบบแนบสลิป */}
                <div className="md:col-span-2 mt-1">
                  <div className="flex items-center gap-3">
                    <label className={`flex items-center justify-center ${isUploading ? 'bg-gray-100 cursor-not-allowed' : 'bg-gray-50 hover:bg-gray-100 cursor-pointer'} text-gray-600 border border-gray-300 border-dashed rounded-xl p-3.5 transition-all duration-200 w-full sm:w-auto active:scale-[0.98]`}>
                       <Camera className="w-5 h-5 mr-2" />
                       <span className="text-sm font-medium">{isUploading ? 'กำลังอัปโหลด...' : (receiptPreview ? 'เปลี่ยนรูป' : 'แนบสลิป/ใบเสร็จ (ไม่เกิน 5MB)')}</span>
                       <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} disabled={isUploading} />
                    </label>
                    {receiptPreview && (
                       <div className="relative animate-in zoom-in duration-200">
                          <img src={receiptPreview} alt="preview" className="h-14 w-14 object-cover rounded-xl border border-gray-200 shadow-sm cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setReceiptViewModal({ isOpen: true, url: receiptPreview })} />
                          <button type="button" onClick={() => { setReceiptFile(null); setReceiptPreview(''); }} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-sm hover:bg-red-600 active:scale-90 transition-transform">
                            <X className="w-3 h-3" />
                          </button>
                       </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button type="submit" disabled={isUploading} className={`flex-1 ${isUploading ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'} text-white py-3.5 rounded-xl font-bold flex justify-center items-center gap-2 active:scale-[0.98] transition-all duration-200 shadow-md`}>
                  {isUploading ? <span className="animate-pulse">กำลังบันทึก...</span> : <><Check className="w-5 h-5" /> {editingId ? 'บันทึกการแก้ไขบัญชี' : 'บันทึกลงบัญชี'}</>}
                </button>
                {editingId && (
                  <button type="button" onClick={cancelEdit} disabled={isUploading} className="py-3.5 sm:px-6 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl font-medium flex justify-center items-center active:scale-[0.98] transition-all duration-200 shadow-sm">ยกเลิกการแก้ไข</button>
                )}
              </div>
            </form>
          </div>
        )}

        {/* Filters (iPad/Mobile Optimized with Multi-select) */}
        <div className="flex flex-col md:flex-row items-start md:items-end gap-4 bg-white p-4 rounded-2xl shadow-sm border border-gray-200 transition-all duration-300 z-10 relative">
          
          <div className="flex flex-row gap-3 w-full md:w-auto">
            <div className="flex flex-col flex-1 relative">
              <span className="text-xs font-semibold text-gray-500 mb-1.5 ml-1">เริ่มวันที่</span>
              <input 
                type="date" value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)} onClick={(e) => { try { e.target.showPicker() } catch(err){} }}
                className="w-full p-3 h-[52px] appearance-none text-left block text-sm border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 transition-all duration-200"
              />
            </div>
            <div className="flex flex-col flex-1 relative">
              <span className="text-xs font-semibold text-gray-500 mb-1.5 ml-1">ถึงวันที่</span>
              <input 
                type="date" value={filterEndDate} onChange={(e) => setFilterEndDate(e.target.value)} onClick={(e) => { try { e.target.showPicker() } catch(err){} }}
                className="w-full p-3 h-[52px] appearance-none text-left block text-sm border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 transition-all duration-200"
              />
            </div>
          </div>

          <div className="flex flex-col w-full md:w-48 relative">
            <span className="text-xs font-semibold text-gray-500 mb-1.5 ml-1">หมวดหมู่ (เลือกได้หลายอัน)</span>
            <button 
              onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
              className="w-full p-3 h-[52px] border border-gray-300 rounded-xl text-left text-sm bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none flex justify-between items-center transition-all shadow-sm"
            >
              <span className="truncate pr-2">{filterCategories.length === 0 ? 'ทุกหมวดหมู่' : filterCategories.join(', ')}</span>
              <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
            </button>
            
            {/* Dropdown Multi-Select */}
            {isCategoryDropdownOpen && (
              <div className="absolute top-[70px] left-0 w-full bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                 <div className={`max-h-60 overflow-y-auto p-2 ${scrollbarClass}`}>
                    <label className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors border-b border-gray-100">
                        <input type="checkbox" checked={filterCategories.length === 0} onChange={() => setFilterCategories([])} className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"/>
                        <span className={`text-sm ${filterCategories.length === 0 ? 'font-bold text-blue-700' : 'font-medium text-gray-600'}`}>ดูทุกหมวดหมู่</span>
                    </label>
                    {allCategories.map(cat => (
                      <label key={cat} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
                          <input 
                            type="checkbox" checked={filterCategories.includes(cat)} 
                            onChange={() => toggleFilterCategory(cat)} 
                            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                          />
                          <span className={`text-sm ${filterCategories.includes(cat) ? 'font-bold text-blue-700' : 'font-medium text-gray-600'}`}>{cat}</span>
                      </label>
                    ))}
                 </div>
              </div>
            )}
          </div>

          <div className="flex flex-col w-full sm:w-auto relative">
             <span className="text-xs font-semibold text-gray-500 mb-1.5 ml-1">ซิงค์ค่าแรงตามตัวกรอง</span>
             <button 
                onClick={() => setSyncWageFilter(!syncWageFilter)}
                className={`w-full sm:w-auto px-4 h-[52px] border rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.97] shadow-sm ${syncWageFilter ? 'bg-indigo-100 border-indigo-300 text-indigo-700' : 'bg-gray-50 border-gray-300 text-gray-500 hover:bg-gray-100'}`}
             >
                <RefreshCw className={`w-4 h-4 ${syncWageFilter ? 'animate-spin-slow' : ''}`} /> {syncWageFilter ? 'เปิดซิงค์แล้ว' : 'ปิดซิงค์ (ดูยอดปัจจุบัน)'}
             </button>
          </div>

          {(filterStartDate || filterEndDate || filterCategories.length > 0 || syncWageFilter) && (
             <div className="flex flex-col w-full sm:w-auto mt-2 md:mt-0 md:ml-auto">
               <button 
                 onClick={() => { setFilterStartDate(''); setFilterEndDate(''); setFilterCategories([]); setSyncWageFilter(false); }} 
                 className="w-full sm:w-auto h-[52px] px-4 bg-red-50 text-red-500 hover:bg-red-100 rounded-xl text-sm font-bold transition-all active:scale-95 flex items-center justify-center gap-1 border border-red-100"
               >
                 <X className="w-4 h-4"/> ล้างตัวกรอง
               </button>
             </div>
          )}
        </div>

        {/* แสดงประวัติการคำนวณค่าแรง (แยกจากบัญชีหลัก) */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden transition-all duration-300">
          <button onClick={() => setIsWageHistoryOpen(!isWageHistoryOpen)} className="w-full p-4 bg-orange-50/50 hover:bg-orange-100/50 border-b border-orange-100 flex justify-between items-center transition-colors duration-200">
            <div className="flex items-center gap-2">
               <History className="w-5 h-5 text-orange-600" />
               <h3 className="font-semibold text-orange-800">ประวัติคำนวณค่าแรง (กล่อง/จัดส่ง/ค่าไฟ)</h3>
            </div>
            <div className="flex items-center gap-2">
               <span className="text-xs font-bold text-orange-600 bg-white px-3 py-1 rounded-full shadow-sm">{filteredWageLogs.length} รายการ</span>
               <ChevronDown className={`w-5 h-5 text-orange-400 transition-transform duration-300 ease-out ${isWageHistoryOpen ? 'rotate-180' : ''}`} />
            </div>
          </button>
          
          <div className={`overflow-hidden transition-all duration-300 ease-out ${isWageHistoryOpen ? 'max-h-[100vh] opacity-100' : 'max-h-0 opacity-0'}`}>
            <div className={`max-h-96 overflow-y-auto bg-white p-3 space-y-3 ${scrollbarClass}`}>
              {filteredWageLogs.length === 0 ? (
                <p className="text-center py-6 text-gray-400 text-sm">ไม่พบประวัติการคำนวณ</p>
              ) : (
                filteredWageLogs.map(log => (
                  <div key={log.id} className={`border rounded-2xl p-3.5 text-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-2 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${log.logType === 'delivery' ? 'bg-purple-50/30 border-purple-100 hover:bg-purple-50' : log.logType === 'electricity' ? 'bg-yellow-50/30 border-yellow-100 hover:bg-yellow-50' : 'bg-orange-50/30 border-orange-100 hover:bg-orange-50'}`}>
                    <div>
                      <span className="font-bold text-gray-800">{log.date}</span>
                      <span className="mx-2 text-gray-300">|</span>
                      
                      {log.logType === 'delivery' ? (
                         <span className="text-purple-600 font-medium">ส่งของรวม {log.totalTrips} รอบ</span>
                      ) : log.logType === 'electricity' ? (
                         <span className="text-yellow-600 font-medium">ค่าไฟ {log.units} หน่วย</span>
                      ) : (
                         <span className="text-orange-600 font-medium">ยอดขาย {log.boxes} กล่อง</span>
                      )}

                      <div className="text-xs text-gray-500 mt-1">
                        {log.logType === 'delivery' ? (
                           <span><Truck className="w-3 h-3 inline mr-1 text-gray-400"/> คนส่ง: {log.deliveryDetails?.map(d => `${d.name}(${d.trips})`).join(', ')} (รวม ฿{log.totalAmount})</span>
                        ) : log.logType === 'electricity' ? (
                           <span><Zap className="w-3 h-3 inline mr-1 text-gray-400"/> ให้ {log.providerName} (มิเตอร์ {log.startMeter}-{log.endMeter}) (รวม ฿{log.totalAmount})</span>
                        ) : (
                           <>
                             {log.prepNames?.length > 0 && <span><ChefHat className="w-3 h-3 inline mr-1 text-gray-400"/> ทำไก่: {log.prepNames.join(', ')} (รวม ฿{log.prepTotal})</span>}
                             {log.prepNames?.length > 0 && log.sellNames?.length > 0 && <span className="mx-1 text-gray-300">|</span>}
                             {log.sellNames?.length > 0 && <span><ShoppingBag className="w-3 h-3 inline mr-1 text-gray-400"/> ขายไก่: {log.sellNames.join(', ')} (รวม ฿{log.sellTotal})</span>}
                             {log.elecCost > 0 && <span className="mx-1 text-gray-300">|</span>}
                             {log.elecCost > 0 && <span><Zap className="w-3 h-3 inline mr-1 text-gray-400"/> ค่าสถานที่ ({log.elecProviderName}): ฿{log.elecCost}</span>}
                           </>
                        )}
                      </div>
                    </div>
                    {isAdmin && (
                      <button onClick={() => handleDeleteWageLog(log)} className="text-gray-400 hover:text-red-500 p-2 bg-white shadow-sm border border-gray-100 rounded-lg md:ml-auto active:scale-90 transition-all duration-200">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Transaction History List (บัญชีหลัก) */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden transition-all duration-300">
          <button onClick={() => setIsMainHistoryOpen(!isMainHistoryOpen)} className="w-full p-4 bg-gray-50 hover:bg-gray-100 border-b border-gray-200 flex justify-between items-center transition-colors duration-200">
            <div className="flex items-center gap-2">
               <History className="w-5 h-5 text-gray-600" />
               <h3 className="font-semibold text-gray-700">ประวัติบัญชีกองกลาง</h3>
            </div>
            <div className="flex items-center gap-2">
               <span className="text-xs font-bold text-gray-600 bg-white px-3 py-1 rounded-full border border-gray-200 shadow-sm">{filteredRecords.length} รายการ</span>
               <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform duration-300 ease-out ${isMainHistoryOpen ? 'rotate-180' : ''}`} />
            </div>
          </button>
          
          <div className={`overflow-hidden transition-all duration-300 ease-out ${isMainHistoryOpen ? 'max-h-[100vh] opacity-100' : 'max-h-0 opacity-0'}`}>
            <div className={`max-h-[60vh] overflow-y-auto bg-white p-3 space-y-3 ${scrollbarClass}`}>
              {filteredRecords.length === 0 ? (
                <p className="text-center py-8 text-gray-400 text-sm">ไม่พบประวัติรายการบัญชี</p>
              ) : (
                filteredRecords.map((record) => (
                  <div key={record.id} className="p-4 rounded-2xl border border-gray-100 hover:shadow-md hover:-translate-y-0.5 flex items-center justify-between transition-all duration-200">
                    <div className="flex items-start md:items-center gap-3 overflow-hidden pr-2">
                      <div className={`p-2.5 rounded-full shrink-0 mt-0.5 md:mt-0 transition-transform duration-300 hover:scale-110 ${record.type === 'income' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                        {record.type === 'income' ? <PlusCircle className="w-5 h-5" /> : <MinusCircle className="w-5 h-5" />}
                      </div>
                      <div className="overflow-hidden">
                        <div className="flex items-center gap-2">
                           <p className="font-semibold text-gray-800 text-sm md:text-base truncate">{record.category}</p>
                           {record.receiptUrl && (
                             <button onClick={() => setReceiptViewModal({ isOpen: true, url: record.receiptUrl })} className="text-blue-500 hover:text-blue-700 active:scale-90 transition-transform bg-blue-50 p-1 rounded-md" title="ดูสลิป">
                               <ImageIcon className="w-4 h-4" />
                             </button>
                           )}
                        </div>
                        <p className="text-xs text-gray-500 break-words">{record.date} {record.note ? `• ${record.note}` : ''}</p>
                      </div>
                    </div>
                    
                    <div className="flex flex-col items-end gap-2 shrink-0 pl-2">
                      <span className={`font-bold text-sm md:text-base ${record.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                        {record.type === 'income' ? '+' : '-'}฿{record.amount.toLocaleString()}
                      </span>
                      {isAdmin && (
                        <div className="flex gap-1">
                          <button onClick={() => handleEdit(record)} className="text-gray-400 hover:text-blue-500 p-2 bg-gray-50 rounded-lg shadow-sm border border-gray-100 active:scale-90 transition-all duration-200" title="แก้ไข">
                            <Edit2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                          </button>
                          <button onClick={() => handleDelete(record.id, record)} className="text-gray-400 hover:text-red-500 p-2 bg-gray-50 rounded-lg shadow-sm border border-gray-100 active:scale-90 transition-all duration-200" title="ลบ">
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
        {/* NEW: ระบบคำนวณต้นทุน (แยกอิสระ) */}
        {/* ==================================================== */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden transition-all duration-300 mt-8">
          <button onClick={() => setIsCostSectionOpen(!isCostSectionOpen)} className="w-full p-4 bg-teal-50/50 hover:bg-teal-100/50 border-b border-teal-100 flex justify-between items-center transition-colors duration-200">
            <div className="flex items-center gap-2">
               <PieChart className="w-5 h-5 text-teal-600" />
               <h3 className="font-semibold text-teal-800">ระบบคำนวณต้นทุน (สูตร)</h3>
            </div>
            <div className="flex items-center gap-2">
               {isAdmin && (
                 <span onClick={(e) => { e.stopPropagation(); setCostFormModal({ isOpen: true, mode: 'add', id: null }); setCostForm({ name: '', yieldPieces: '', ingredients: [{ id: Date.now(), name: '', price: '', qtyBought: '', unit: '', usage: '', usageType: 'per_recipe' }], electricity: { enabled: false, watts: '', unitPrice: '5', minutes: '', piecesPerBatch: '' }, boxConfig: { piecesPerBox: '', packagingCost: '', laborCost: '' } }); }} className="text-xs font-bold text-teal-700 bg-white px-3 py-1.5 rounded-full shadow-sm hover:bg-teal-50 active:scale-90 transition-all flex items-center gap-1 border border-teal-100">
                   <Plus className="w-3 h-3"/> เพิ่มสูตรใหม่
                 </span>
               )}
               <ChevronDown className={`w-5 h-5 text-teal-400 transition-transform duration-300 ease-out ${isCostSectionOpen ? 'rotate-180' : ''}`} />
            </div>
          </button>
          
          <div className={`overflow-hidden transition-all duration-300 ease-out ${isCostSectionOpen ? 'max-h-[150vh] opacity-100' : 'max-h-0 opacity-0'}`}>
            <div className="p-4 md:p-6 bg-teal-50/10">
               <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                  {costProfiles.length === 0 ? (
                    <div className="col-span-full p-6 text-center text-gray-400 bg-white rounded-2xl border border-dashed border-gray-200">ยังไม่มีสูตรคำนวณต้นทุน</div>
                  ) : (
                    costProfiles.map(profile => (
                      <div key={profile.id} className="border border-gray-200 rounded-2xl p-4 flex flex-col justify-between gap-3 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 bg-white relative group">
                         <div className="flex justify-between items-start">
                            <div className="pr-6">
                               <span className="font-bold text-gray-800 text-sm block line-clamp-2 leading-snug">{profile.name}</span>
                               <span className="text-xs text-gray-500 mt-1 block">{profile.ingredients?.length || 0} วัตถุดิบหลัก</span>
                            </div>
                            <button onClick={() => setCostDetailsModal({ isOpen: true, profile })} className="absolute top-3 right-3 text-teal-400 hover:text-teal-600 transition-all duration-200 p-1 active:scale-90" title="ดูรายละเอียดต้นทุน">
                               <Info className="w-5 h-5" />
                            </button>
                         </div>
                         
                         <div className="mt-2 bg-gray-50 rounded-xl p-3 border border-gray-100 text-center transition-colors duration-300 group-hover:bg-teal-50/30">
                            <span className="text-xs text-gray-500 block mb-0.5">ต้นทุนรวมสุทธิ/กล่อง</span>
                            <span className="text-xl font-bold text-teal-600">฿{(profile.summary?.totalBoxCost || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                         </div>
                         
                         {isAdmin && (
                           <div className="flex gap-2 mt-1">
                              <button onClick={() => handleDuplicateCostProfile(profile)} className="flex items-center justify-center gap-1 bg-white text-blue-500 border border-blue-100 py-2 px-3 rounded-xl hover:bg-blue-50 active:scale-[0.97] transition-all duration-200 shadow-sm" title="คัดลอกสูตรนี้">
                                <Copy className="w-4 h-4" />
                              </button>
                              <button onClick={() => openEditCostProfile(profile)} className="flex-1 flex items-center justify-center gap-1.5 bg-white text-gray-600 border border-gray-200 py-2 rounded-xl text-xs font-medium hover:bg-gray-50 active:scale-[0.97] transition-all duration-200 shadow-sm">
                                <Edit2 className="w-3 h-3" /> แก้ไข
                              </button>
                              <button onClick={() => handleDeleteCostProfile(profile.id, profile)} className="flex items-center justify-center bg-white text-red-500 border border-red-100 py-2 px-3 rounded-xl hover:bg-red-50 active:scale-[0.97] transition-all duration-200 shadow-sm">
                                <Trash2 className="w-4 h-4" />
                              </button>
                           </div>
                         )}
                      </div>
                    ))
                  )}
               </div>
            </div>
          </div>
        </div>

      </div>

      {/* ==================================================== */}
      {/* MODALS SECTION (IOS ANIMATED) */}
      {/* ==================================================== */}
      
      {/* Modal ดูรูปสลิป */}
      <AnimatedModal isOpen={receiptViewModal.isOpen} onClose={() => setReceiptViewModal(prev => ({ ...prev, isOpen: false }))} maxWidth="max-w-2xl" bgClass="bg-transparent" pClass="p-0">
        <div className="relative flex flex-col items-center">
            <button onClick={() => setReceiptViewModal(prev => ({ ...prev, isOpen: false }))} className="absolute -top-12 right-0 text-white/80 hover:text-white bg-black/40 hover:bg-black/60 rounded-full p-2 transition-all active:scale-90">
               <X className="w-6 h-6" />
            </button>
            <img src={receiptViewModal.url} alt="Receipt" className="max-h-[85vh] w-auto object-contain rounded-2xl shadow-2xl" />
        </div>
      </AnimatedModal>

      {/* Modal Login */}
      <AnimatedModal isOpen={showLoginModal} onClose={() => { setShowLoginModal(false); setPinInput(''); }} originClass="origin-top-right">
          <div className="flex flex-col items-center justify-center mb-6">
            <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-4 shadow-sm border border-blue-100">
               <Lock size={26} />
            </div>
            <h3 className="text-xl font-bold text-gray-800">เข้าสู่ระบบ Admin</h3>
            <p className="text-sm text-gray-500 text-center mt-1">ใส่รหัส PIN เพื่อจัดการระบบบัญชี</p>
          </div>
          
          <form onSubmit={handleLogin}>
            <div className="mb-6">
              <input 
                type="password" pattern="[0-9]*" inputMode="numeric"
                value={pinInput} onChange={(e) => setPinInput(e.target.value)} 
                className="w-full p-4 text-center text-3xl tracking-[0.5em] border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50 text-gray-900 transition-all duration-200" 
                placeholder="••••••" autoFocus required 
              />
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => { setShowLoginModal(false); setPinInput(''); }} className="flex-1 py-3 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium active:scale-[0.97] transition-all duration-200">ยกเลิก</button>
              <button type="submit" className="flex-1 py-3 text-white bg-blue-600 hover:bg-blue-700 rounded-xl font-bold active:scale-[0.97] transition-all duration-200 shadow-md hover:shadow-lg">ปลดล็อก</button>
            </div>
          </form>
      </AnimatedModal>

      {/* Modal จัดการ หุ้นส่วนพื้นฐาน */}
      <AnimatedModal isOpen={partnerModal.isOpen} onClose={() => setPartnerModal(prev => ({ ...prev, isOpen: false }))}>
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
                  className="w-full p-3 h-[52px] appearance-none text-left block border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50 text-gray-900 transition-all duration-200"
                  placeholder={partnerModal.mode === 'add' ? 'ชื่อบุคคล' : '0.00'} autoFocus
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6 pt-2">
              <button type="button" onClick={() => setPartnerModal({ isOpen: false, mode: '', data: null, value: '' })} className="flex-1 py-3 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium active:scale-[0.97] transition-all duration-200">ยกเลิก</button>
              <button type="submit" className="flex-1 py-3 text-white bg-blue-600 hover:bg-blue-700 rounded-xl text-sm font-bold active:scale-[0.97] transition-all duration-200 shadow-md">บันทึก</button>
            </div>
          </form>
      </AnimatedModal>

      {/* Modal ตั้งค่าเรทค่าแรง/ค่าส่ง/ค่าไฟ (Settings) */}
      <AnimatedModal isOpen={wageSettingsModal.isOpen} onClose={() => setWageSettingsModal(prev => ({ ...prev, isOpen: false }))}>
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-800 border-b pb-3">
            <Settings className="text-orange-500" /> ตั้งค่าเรทมาตรฐาน
          </h3>
          <form onSubmit={handleSaveWageSettings}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ค่าแรงทำไก่ (บาท/กล่อง)</label>
                <input type="number" step="any" min="0" required
                  value={wageSettingsModal.prepRate} onChange={(e) => setWageSettingsModal({...wageSettingsModal, prepRate: e.target.value})}
                  className="w-full p-3 h-[52px] appearance-none text-left block border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none bg-gray-50 text-gray-900 transition-all duration-200"
                  placeholder="0.00" autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ค่าแรงขายไก่ (บาท/กล่อง)</label>
                <input type="number" step="any" min="0" required
                  value={wageSettingsModal.sellRate} onChange={(e) => setWageSettingsModal({...wageSettingsModal, sellRate: e.target.value})}
                  className="w-full p-3 h-[52px] appearance-none text-left block border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none bg-gray-50 text-gray-900 transition-all duration-200"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ค่าจัดส่ง (บาท/รอบ)</label>
                <input type="number" step="any" min="0" required
                  value={wageSettingsModal.deliveryRate} onChange={(e) => setWageSettingsModal({...wageSettingsModal, deliveryRate: e.target.value})}
                  className="w-full p-3 h-[52px] appearance-none text-left block border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none bg-gray-50 text-gray-900 transition-all duration-200"
                  placeholder="0.00"
                />
              </div>
              <div className="pt-2 border-t border-gray-100">
                <label className="block text-sm font-medium text-gray-700 mb-1">ค่าไฟ (บาท/หน่วย)</label>
                <input type="number" step="any" min="0" required
                  value={wageSettingsModal.elecUnitPrice} onChange={(e) => setWageSettingsModal({...wageSettingsModal, elecUnitPrice: e.target.value})}
                  className="w-full p-3 h-[52px] appearance-none text-left block border border-gray-300 rounded-xl focus:ring-2 focus:ring-yellow-500 outline-none bg-gray-50 text-gray-900 transition-all duration-200"
                  placeholder="เช่น 5"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6 pt-2">
              <button type="button" onClick={() => setWageSettingsModal({ isOpen: false, prepRate: '', sellRate: '', deliveryRate: '', elecUnitPrice: '' })} className="flex-1 py-3 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium active:scale-[0.97] transition-all duration-200">ยกเลิก</button>
              <button type="submit" className="flex-1 py-3 text-white bg-blue-600 hover:bg-blue-700 rounded-xl text-sm font-bold active:scale-[0.97] transition-all duration-200 shadow-md">บันทึกตั้งค่า</button>
            </div>
          </form>
      </AnimatedModal>

      {/* Modal เลือกคนทำไก่ / ขายไก่ */}
      <AnimatedModal isOpen={partnerSelectModal.isOpen} onClose={() => setPartnerSelectModal(prev => ({ ...prev, isOpen: false }))} originClass="origin-bottom">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-800 border-b pb-3 shrink-0">
            {partnerSelectModal.type === 'prep' ? <ChefHat className="text-orange-500" /> : <ShoppingBag className="text-orange-500" />}
            เลือกคน{partnerSelectModal.type === 'prep' ? 'ทำไก่' : 'ขายไก่'}
          </h3>
          
          <div className={`overflow-y-auto flex-1 space-y-2 pr-2 mb-4 ${scrollbarClass}`}>
            {partners.length === 0 ? <p className="text-center text-sm text-gray-400 py-4">ยังไม่มีรายชื่อพนักงาน</p> : null}
            {partners.map(p => {
               const isSelected = wageForm[partnerSelectModal.type === 'prep' ? 'prepPartners' : 'sellPartners'].includes(p.id);
               return (
                 <label key={p.id} className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all duration-200 active:scale-[0.98] ${isSelected ? 'border-orange-500 bg-orange-50 shadow-sm' : 'border-gray-200 hover:bg-gray-50'}`}>
                    <input 
                      type="checkbox" checked={isSelected}
                      onChange={() => togglePartnerSelection(p.id, partnerSelectModal.type)}
                      className="w-5 h-5 text-orange-600 rounded focus:ring-orange-500 cursor-pointer transition-all"
                    />
                    <span className={`font-medium ${isSelected ? 'text-orange-800' : 'text-gray-700'}`}>{p.name}</span>
                 </label>
               );
            })}
          </div>
          <button type="button" onClick={() => setPartnerSelectModal({ isOpen: false, type: '' })} className="w-full py-3.5 text-white bg-gray-800 hover:bg-black rounded-xl text-sm font-bold active:scale-[0.98] transition-all duration-200 shadow-md shrink-0">ตกลง</button>
      </AnimatedModal>

      {/* Modal เลือกคนส่งของ */}
      <AnimatedModal isOpen={deliverySelectModal.isOpen} onClose={() => setDeliverySelectModal(prev => ({ ...prev, isOpen: false }))} originClass="origin-bottom">
          <h3 className="text-lg font-bold mb-1 flex items-center gap-2 text-gray-800 shrink-0">
            <Truck className="text-purple-500" /> ระบุรอบส่งของแต่ละคน
          </h3>
          <p className="text-sm text-gray-500 mb-4 border-b pb-3">รวมต้องได้ {deliveryForm.totalTrips || 0} รอบ</p>
          
          <div className={`overflow-y-auto flex-1 space-y-2 pr-2 mb-4 ${scrollbarClass}`}>
            {partners.length === 0 ? <p className="text-center text-sm text-gray-400 py-4">ยังไม่มีรายชื่อพนักงาน</p> : null}
            {partners.map(p => {
               const currentTrips = deliveryForm.tripsByPartner[p.id] || 0;
               return (
                 <div key={p.id} className={`flex items-center justify-between p-2.5 rounded-xl border transition-all duration-200 ${currentTrips > 0 ? 'border-purple-400 bg-purple-50 shadow-sm' : 'border-gray-200 hover:bg-gray-50'}`}>
                    <span className={`font-medium ml-2 ${currentTrips > 0 ? 'text-purple-800' : 'text-gray-700'}`}>{p.name}</span>
                    <div className="flex items-center gap-2">
                       <input 
                         type="number" min="0" step="1" placeholder="0"
                         value={currentTrips || ''}
                         onChange={(e) => handleDeliveryTripChange(p.id, e.target.value)}
                         className="w-16 p-2 h-[40px] text-center border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm font-bold text-purple-600 bg-white transition-all appearance-none"
                       />
                       <span className="text-xs text-gray-500 w-6">รอบ</span>
                    </div>
                 </div>
               );
            })}
          </div>
          
          <div className="flex justify-between items-center bg-gray-50 p-3 rounded-xl mb-4 text-sm border border-gray-100">
             <span className="font-medium text-gray-600">รวมที่กรอกแล้ว:</span>
             <span className={`font-bold ${Object.values(deliveryForm.tripsByPartner).reduce((a,b)=>a+b,0) === Number(deliveryForm.totalTrips) ? 'text-green-600' : 'text-red-500'}`}>
                {Object.values(deliveryForm.tripsByPartner).reduce((a,b)=>a+b,0)} / {deliveryForm.totalTrips || 0}
             </span>
          </div>

          <button type="button" onClick={() => setDeliverySelectModal({ isOpen: false })} className="w-full py-3.5 text-white bg-gray-800 hover:bg-black rounded-xl text-sm font-bold active:scale-[0.98] transition-all duration-200 shadow-md shrink-0">ตกลง / ปิด</button>
      </AnimatedModal>

      {/* Modal ดูประวัติส่วนตัว */}
      <AnimatedModal isOpen={partnerDetailsModal.isOpen} onClose={() => setPartnerDetailsModal(prev => ({ ...prev, isOpen: false }))} pClass="p-0">
          <div className="p-4 border-b border-blue-100 flex justify-between items-center bg-blue-50/50 rounded-t-3xl shrink-0">
             <h3 className="text-lg font-bold flex items-center gap-2 text-blue-900">
               <Info className="text-blue-500 w-5 h-5" /> ประวัติยอดเงิน: {partnerDetailsModal.partner?.name}
             </h3>
             <button onClick={() => setPartnerDetailsModal(prev => ({ ...prev, isOpen: false }))} className="text-blue-400 hover:text-blue-600 p-1.5 bg-white rounded-full shadow-sm active:scale-90 transition-all"><X className="w-4 h-4"/></button>
          </div>
          
          <div className={`overflow-y-auto max-h-[60vh] flex-1 p-4 bg-gray-50/50 ${scrollbarClass}`}>
             {getPartnerStatement(partnerDetailsModal.partner).length === 0 ? (
               <p className="text-center text-sm text-gray-400 py-10">ยังไม่มีประวัติการได้เงิน หรือการเบิกจ่าย</p>
             ) : (
               <div className="space-y-3">
                 {getPartnerStatement(partnerDetailsModal.partner).map((stmt, idx) => (
                   <div key={idx} className={`p-3.5 rounded-xl border bg-white flex justify-between items-center shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 ${stmt.isIncome ? 'border-l-4 border-l-orange-400' : 'border-l-4 border-l-blue-400'}`}>
                      <div>
                        <div className="font-semibold text-gray-800 text-sm">{stmt.text}</div>
                        <div className="text-xs text-gray-500 mt-1">{stmt.date}</div>
                      </div>
                      <div className={`font-bold text-base ${stmt.isIncome ? 'text-orange-600' : 'text-blue-600'}`}>
                         {stmt.isIncome ? '+' : '-'}฿{stmt.amount.toLocaleString()}
                      </div>
                   </div>
                 ))}
               </div>
             )}
          </div>
          
          <div className="p-5 border-t border-gray-100 bg-white rounded-b-3xl shrink-0 space-y-2.5 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
             <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600 font-medium">ยอดค่าแรงรอจ่าย:</span>
                <span className="font-semibold text-orange-600 text-base">฿{(partnerDetailsModal.partner?.pendingWage || 0).toLocaleString()}</span>
             </div>
             <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600 font-medium">ปันผลเฉลี่ยตามสถานะร้าน:</span>
                <span className={`font-semibold text-base ${dividendPerPerson >= 0 ? 'text-teal-600' : 'text-red-600'}`}>
                  {dividendPerPerson >= 0 ? '+' : ''}฿{dividendPerPerson.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 2})}
                </span>
             </div>
             <div className="flex justify-between items-center pt-3 border-t border-gray-100 mt-1">
                <span className="text-base font-bold text-gray-800">ยอดรวมทั้งหมด:</span>
                <span className="text-2xl font-bold text-blue-600">
                   ฿{((partnerDetailsModal.partner?.pendingWage || 0) + dividendPerPerson).toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 2})}
                </span>
             </div>
          </div>
      </AnimatedModal>

      {/* NEW: Modal จัดการสูตรคำนวณต้นทุน (Admin) */}
      <AnimatedModal isOpen={costFormModal.isOpen} onClose={() => setCostFormModal(prev => ({ ...prev, isOpen: false }))} maxWidth="max-w-2xl" pClass="p-0">
         <div className="p-4 border-b border-teal-100 flex justify-between items-center bg-teal-50/50 rounded-t-3xl shrink-0">
             <h3 className="text-lg font-bold flex items-center gap-2 text-teal-800">
               {costFormModal.mode === 'add' ? <PlusCircle className="text-teal-500 w-5 h-5" /> : <Edit2 className="text-teal-500 w-5 h-5" />}
               {costFormModal.mode === 'add' ? 'สร้างสูตรคำนวณต้นทุน' : 'แก้ไขสูตรคำนวณ'}
             </h3>
             <button onClick={() => setCostFormModal(prev => ({ ...prev, isOpen: false }))} className="text-teal-400 hover:text-teal-600 p-1.5 bg-white rounded-full shadow-sm active:scale-90 transition-all"><X className="w-4 h-4"/></button>
          </div>

          <form onSubmit={handleSaveCostProfile} className="flex flex-col h-full max-h-[85vh]">
              <div className={`overflow-y-auto flex-1 p-4 md:p-6 bg-gray-50/30 ${scrollbarClass}`}>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div className="md:col-span-1">
                       <label className="block text-sm font-bold text-gray-700 mb-1">ชื่อสูตรต้นทุน</label>
                       <input 
                         type="text" required value={costForm.name} onChange={e => handleCostFieldChange('name', e.target.value)}
                         className="w-full p-3 h-[52px] appearance-none text-left block border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none bg-white text-gray-900 transition-all shadow-sm"
                         placeholder="เช่น เมนูไก่ทอดชีส 5 ชิ้น"
                       />
                    </div>
                    <div className="md:col-span-1">
                       <label className="block text-sm font-bold text-gray-700 mb-1">ผลผลิตที่ได้จาก 1 สูตร</label>
                       <div className="flex gap-2">
                           <input 
                             type="number" min="1" step="any" required value={costForm.yieldPieces} onChange={e => handleCostFieldChange('yieldPieces', e.target.value)}
                             className="w-full p-3 h-[52px] appearance-none text-left block border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none bg-white text-gray-900 transition-all shadow-sm text-center font-bold text-teal-700"
                             placeholder="25"
                           />
                           <div className="bg-gray-100 border border-gray-200 rounded-xl px-4 flex items-center justify-center text-sm font-medium text-gray-600">ชิ้น</div>
                       </div>
                    </div>
                 </div>

                 {/* ส่วนที่ 2: วัตถุดิบ */}
                 <div className="space-y-4 mb-8">
                    <div className="flex justify-between items-end border-b border-gray-200 pb-2">
                       <h4 className="font-bold text-gray-700">วัตถุดิบ (คิดต่อชิ้น)</h4>
                       <button type="button" onClick={addCostIngredient} className="text-xs font-bold text-teal-600 bg-teal-50 px-3 py-1.5 rounded-lg border border-teal-100 hover:bg-teal-100 active:scale-95 transition-all flex items-center gap-1">
                          <Plus className="w-3 h-3"/> เพิ่มวัตถุดิบ
                       </button>
                    </div>

                    {costForm.ingredients.map((ing) => (
                       <div key={ing.id} className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm relative group">
                          {costForm.ingredients.length > 1 && (
                            <button type="button" onClick={() => removeCostIngredient(ing.id)} className="absolute top-3 right-3 text-gray-300 hover:text-red-500 p-1 bg-white rounded-md active:scale-90 transition-all z-10">
                               <Trash2 className="w-4 h-4"/>
                           </button>
                          )}
                          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                             <div className="md:col-span-4">
                                <label className="block text-xs font-semibold text-gray-500 mb-1">ชื่อวัตถุดิบ</label>
                                <input type="text" required value={ing.name} onChange={e => handleCostIngredientChange(ing.id, 'name', e.target.value)} className="w-full p-2.5 h-[42px] appearance-none text-left block border border-gray-200 rounded-lg focus:ring-1 focus:ring-teal-500 outline-none text-sm bg-gray-50" placeholder="เช่น ไก่สด, ผงหมัก"/>
                             </div>
                             <div className="md:col-span-3">
                                <label className="block text-xs font-semibold text-gray-500 mb-1">ราคาที่ซื้อมา (฿)</label>
                                <input type="number" required min="0" step="any" value={ing.price} onChange={e => handleCostIngredientChange(ing.id, 'price', e.target.value)} className="w-full p-2.5 h-[42px] appearance-none text-left block border border-gray-200 rounded-lg focus:ring-1 focus:ring-teal-500 outline-none text-sm bg-gray-50" placeholder="฿"/>
                             </div>
                             <div className="md:col-span-3">
                                <label className="block text-xs font-semibold text-gray-500 mb-1">ปริมาณที่ได้</label>
                                <div className="flex gap-1">
                                    <input type="number" required min="0.01" step="any" value={ing.qtyBought} onChange={e => handleCostIngredientChange(ing.id, 'qtyBought', e.target.value)} className="w-2/3 p-2.5 h-[42px] appearance-none text-left block border border-gray-200 rounded-lg focus:ring-1 focus:ring-teal-500 outline-none text-sm bg-gray-50 text-center" placeholder="จำนวน"/>
                                    <input type="text" value={ing.unit} onChange={e => handleCostIngredientChange(ing.id, 'unit', e.target.value)} className="w-1/3 p-2.5 h-[42px] appearance-none text-left block border border-gray-200 rounded-lg focus:ring-1 focus:ring-teal-500 outline-none text-sm bg-white text-center" placeholder="หน่วย"/>
                                </div>
                             </div>
                             <div className="md:col-span-2 text-right pb-2 hidden md:block">
                                <span className="text-[10px] text-gray-400 block">ต้นทุน/หน่วย</span>
                                <span className="text-xs font-bold text-teal-600 border-b border-dashed border-teal-200 pb-0.5">
                                   ฿{( (Number(ing.price)||0) / (Number(ing.qtyBought)||1) ).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}
                                </span>
                             </div>
                             
                             <div className="md:col-span-7 mt-1 md:mt-0">
                                <label className="block text-xs font-semibold text-gray-500 mb-1">ปริมาณที่ใช้</label>
                                <div className="flex gap-2">
                                    <input type="number" required min="0" step="any" value={ing.usage} onChange={e => handleCostIngredientChange(ing.id, 'usage', e.target.value)} className="w-1/2 p-2.5 h-[42px] appearance-none text-left block border border-teal-200 rounded-lg focus:ring-1 focus:ring-teal-500 outline-none text-sm bg-teal-50/30 text-teal-700 font-bold text-center" placeholder="จำนวนที่ใช้"/>
                                    <select value={ing.usageType} onChange={e => handleCostIngredientChange(ing.id, 'usageType', e.target.value)} className="w-1/2 p-2.5 h-[42px] appearance-none text-left block border border-gray-200 rounded-lg focus:ring-1 focus:ring-teal-500 outline-none text-sm bg-white">
                                        <option value="per_recipe">ต่อ {costForm.yieldPieces || 'X'} ชิ้น (สูตรรวม)</option>
                                        <option value="per_piece">ต่อ 1 ชิ้น</option>
                                    </select>
                                </div>
                             </div>
                             
                             <div className="md:col-span-5 flex flex-col justify-end text-right bg-gray-50 rounded-lg p-2 border border-gray-100 mt-2 md:mt-0 h-[52px]">
                                <span className="text-[10px] text-gray-500 block mb-0.5">ต้นทุนเฉพาะชิ้นนี้ =</span>
                                <span className="font-bold text-teal-600 text-sm">
                                   ฿{calcIngCostPerPiece(ing, costForm.yieldPieces).toLocaleString(undefined, {minimumFractionDigits:3, maximumFractionDigits:3})}
                                </span>
                             </div>
                          </div>
                       </div>
                    ))}
                 </div>

                 {/* Section 3: ไฟฟ้า/แก๊ส */}
                 <div className="space-y-3 mb-8 bg-orange-50/50 p-4 rounded-2xl border border-orange-100">
                    <div className="flex justify-between items-center border-b border-orange-200 pb-2">
                       <h4 className="font-bold text-orange-800 flex items-center gap-1.5"><Zap className="w-4 h-4"/> ค่าพลังงาน/ค่าไฟ (ต่อการทำ 1 รอบ)</h4>
                       <label className="flex items-center cursor-pointer gap-2">
                         <span className="text-xs font-semibold text-orange-600">เปิดใช้งาน</span>
                         <input type="checkbox" checked={costForm.electricity.enabled} onChange={e => handleCostElectChange('enabled', e.target.checked)} className="w-4 h-4 text-orange-600 focus:ring-orange-500 rounded"/>
                       </label>
                    </div>
                    {costForm.electricity.enabled && (
                       <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-in fade-in duration-300">
                          <div>
                             <label className="block text-xs font-semibold text-gray-500 mb-1">กำลังไฟ (วัตต์)</label>
                             <input type="number" min="0" value={costForm.electricity.watts} onChange={e => handleCostElectChange('watts', e.target.value)} className="w-full p-2.5 h-[42px] appearance-none text-left block border border-orange-200 rounded-lg focus:ring-1 focus:ring-orange-500 outline-none text-sm bg-white" placeholder="เช่น 1200"/>
                          </div>
                          <div>
                             <label className="block text-xs font-semibold text-gray-500 mb-1">ค่าไฟ (บาท/หน่วย)</label>
                             <input type="number" min="0" step="any" value={costForm.electricity.unitPrice} onChange={e => handleCostElectChange('unitPrice', e.target.value)} className="w-full p-2.5 h-[42px] appearance-none text-left block border border-orange-200 rounded-lg focus:ring-1 focus:ring-orange-500 outline-none text-sm bg-white" placeholder="เช่น 5"/>
                          </div>
                          <div>
                             <label className="block text-xs font-semibold text-gray-500 mb-1">เวลาทอด (นาที)</label>
                             <input type="number" min="0" value={costForm.electricity.minutes} onChange={e => handleCostElectChange('minutes', e.target.value)} className="w-full p-2.5 h-[42px] appearance-none text-left block border border-orange-200 rounded-lg focus:ring-1 focus:ring-orange-500 outline-none text-sm bg-white" placeholder="เช่น 20"/>
                          </div>
                          <div>
                             <label className="block text-xs font-semibold text-gray-500 mb-1">ทอดได้กี่ชิ้น/รอบ?</label>
                             <input type="number" min="1" value={costForm.electricity.piecesPerBatch} onChange={e => handleCostElectChange('piecesPerBatch', e.target.value)} className="w-full p-2.5 h-[42px] appearance-none text-left block border border-orange-200 rounded-lg focus:ring-1 focus:ring-orange-500 outline-none text-sm bg-white" placeholder="เช่น 15"/>
                          </div>
                       </div>
                    )}
                 </div>

                 {/* Section 4: ลงกล่อง */}
                 <div className="space-y-3 bg-purple-50/50 p-4 rounded-2xl border border-purple-100">
                    <h4 className="font-bold text-purple-800 flex items-center gap-1.5 border-b border-purple-200 pb-2"><Box className="w-4 h-4"/> การบรรจุลงกล่อง</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                           <label className="block text-xs font-semibold text-gray-500 mb-1">1 กล่อง ใส่กี่ชิ้น?</label>
                           <input type="number" min="1" required value={costForm.boxConfig.piecesPerBox} onChange={e => handleCostBoxChange('piecesPerBox', e.target.value)} className="w-full p-2.5 h-[42px] appearance-none text-left block border border-purple-200 rounded-lg focus:ring-1 focus:ring-purple-500 outline-none text-sm bg-white font-bold text-purple-700 text-center" placeholder="เช่น 5"/>
                        </div>
                        <div>
                           <label className="block text-xs font-semibold text-gray-500 mb-1">ค่ากล่อง/ซอส/แพ็คเกจ (฿)</label>
                           <input type="number" min="0" step="any" value={costForm.boxConfig.packagingCost} onChange={e => handleCostBoxChange('packagingCost', e.target.value)} className="w-full p-2.5 h-[42px] appearance-none text-left block border border-purple-200 rounded-lg focus:ring-1 focus:ring-purple-500 outline-none text-sm bg-white" placeholder="0.00"/>
                        </div>
                        <div>
                           <label className="block text-xs font-semibold text-gray-500 mb-1">ค่าแรงแพ็ค (฿/กล่อง)</label>
                           <input type="number" min="0" step="any" value={costForm.boxConfig.laborCost} onChange={e => handleCostBoxChange('laborCost', e.target.value)} className="w-full p-2.5 h-[42px] appearance-none text-left block border border-purple-200 rounded-lg focus:ring-1 focus:ring-purple-500 outline-none text-sm bg-white" placeholder="0.00"/>
                        </div>
                    </div>
                 </div>

              </div>
              
              {/* Footer Summary */}
              <div className="p-4 border-t border-gray-100 bg-white rounded-b-3xl shrink-0 flex flex-col md:flex-row justify-between items-center gap-4 shadow-[0_-4px_10px_-1px_rgba(0,0,0,0.05)]">
                 <div className="w-full md:w-auto grid grid-cols-2 md:flex md:items-center gap-3">
                    <div className="text-center md:text-left bg-gray-50 px-3 py-2 rounded-xl border border-gray-100">
                        <span className="text-[10px] text-gray-500 block leading-tight">ต้นทุนต่อ 1 ชิ้น</span>
                        <span className="text-sm font-bold text-gray-700">฿{generateCostSummary(costForm).totalPerPiece.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
                    </div>
                    <div className="text-center md:text-left bg-teal-50 px-4 py-2 rounded-xl border border-teal-200 shadow-sm">
                        <span className="text-[10px] text-teal-600 font-bold block leading-tight">ต้นทุนรวมสุทธิ (ต่อกล่อง)</span>
                        <span className="text-xl font-bold text-teal-700 leading-none">฿{generateCostSummary(costForm).totalBoxCost.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
                    </div>
                 </div>
                 <div className="flex gap-2 w-full md:w-auto">
                    <button type="button" onClick={() => setCostFormModal(prev => ({ ...prev, isOpen: false }))} className="flex-1 md:flex-none py-3 px-6 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium active:scale-[0.97] transition-all">ยกเลิก</button>
                    <button type="submit" className="flex-1 md:flex-none py-3 px-6 text-white bg-teal-600 hover:bg-teal-700 rounded-xl text-sm font-bold active:scale-[0.97] transition-all shadow-md">บันทึกสูตร</button>
                 </div>
              </div>
          </form>
      </AnimatedModal>

      {/* Modal ดูรายละเอียดสูตรต้นทุน (ใบแจ้งหนี้แบบย่อ) */}
      <AnimatedModal isOpen={costDetailsModal.isOpen} onClose={() => setCostDetailsModal(prev => ({ ...prev, isOpen: false }))} pClass="p-0">
          <div className="p-4 border-b border-teal-100 flex justify-between items-center bg-teal-50/50 rounded-t-3xl shrink-0">
             <h3 className="text-lg font-bold flex items-center gap-2 text-teal-900 truncate pr-4">
               <ClipboardList className="text-teal-500 w-5 h-5 shrink-0" /> รายละเอียดต้นทุน
             </h3>
             <button onClick={() => setCostDetailsModal(prev => ({ ...prev, isOpen: false }))} className="text-teal-400 hover:text-teal-600 p-1.5 bg-white rounded-full shadow-sm active:scale-90 transition-all shrink-0"><X className="w-4 h-4"/></button>
          </div>
          
          <div className={`overflow-y-auto max-h-[65vh] flex-1 p-5 bg-gray-50/50 ${scrollbarClass}`}>
             {costDetailsModal.profile && (
                 <div className="space-y-5">
                    {/* Header Info */}
                    <div className="text-center pb-4 border-b border-gray-200 border-dashed">
                       <h2 className="text-xl font-bold text-gray-800 mb-1">{costDetailsModal.profile.name}</h2>
                       <span className="text-xs bg-teal-100 text-teal-700 px-2 py-1 rounded-md font-medium">ทำได้ {costDetailsModal.profile.yieldPieces || 1} ชิ้น/สูตร</span>
                    </div>

                    {/* ต้นทุนต่อชิ้น */}
                    <div>
                        <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-1.5"><ChefHat className="w-4 h-4 text-gray-400"/> สรุปต้นทุนต่อ 1 ชิ้น</h4>
                        <div className="space-y-2 bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                            {costDetailsModal.profile.summary?.ingDetails?.map((ing, idx) => (
                                <div key={idx} className="flex justify-between items-center text-sm py-1 border-b border-gray-50 last:border-0">
                                    <span className="text-gray-600">{ing.name}</span>
                                    <span className="font-semibold text-gray-800">฿{(ing.costPerPiece || 0).toFixed(3)}</span>
                                </div>
                            ))}
                            {costDetailsModal.profile.electricity?.enabled && (
                                <div className="flex justify-between items-center text-sm py-1 border-b border-gray-50 last:border-0">
                                    <span className="text-orange-600 flex items-center gap-1"><Zap className="w-3 h-3"/> ค่าไฟฟ้า/แก๊ส</span>
                                    <span className="font-semibold text-orange-600">฿{(costDetailsModal.profile.summary?.elePerPiece || 0).toFixed(3)}</span>
                                </div>
                            )}
                            <div className="flex justify-between items-center text-sm pt-2 mt-1 border-t border-gray-200">
                                <span className="font-bold text-gray-800">รวมต้นทุน 1 ชิ้น</span>
                                <span className="font-bold text-teal-600">฿{(costDetailsModal.profile.summary?.totalPerPiece || 0).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
                            </div>
                        </div>
                    </div>

                    {/* ต้นทุนต่อกล่อง */}
                    <div>
                        <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-1.5"><Box className="w-4 h-4 text-gray-400"/> สรุปต้นทุนลงกล่อง</h4>
                        <div className="space-y-2 bg-purple-50/30 p-3 rounded-xl border border-purple-100 shadow-sm">
                            <div className="flex justify-between items-center text-sm py-1">
                                <span className="text-gray-600">ของ {costDetailsModal.profile.boxConfig?.piecesPerBox || 1} ชิ้น</span>
                                <span className="font-semibold text-gray-800">฿{((costDetailsModal.profile.summary?.totalPerPiece || 0) * (Number(costDetailsModal.profile.boxConfig?.piecesPerBox) || 1)).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm py-1">
                                <span className="text-gray-600">แพ็คเกจจิ้ง/กล่อง/ซอส</span>
                                <span className="font-semibold text-gray-800">฿{Number(costDetailsModal.profile.boxConfig?.packagingCost || 0).toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm py-1">
                                <span className="text-gray-600">ค่าแรงแพ็ค</span>
                                <span className="font-semibold text-gray-800">฿{Number(costDetailsModal.profile.boxConfig?.laborCost || 0).toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
                 </div>
             )}
          </div>
          
          <div className="p-5 border-t border-teal-200 bg-teal-50 rounded-b-3xl shrink-0 flex justify-between items-center shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
              <span className="text-sm font-bold text-teal-800">ต้นทุนรวมสุทธิ / กล่อง:</span>
              <span className="text-2xl font-bold text-teal-700">
                 ฿{(costDetailsModal.profile?.summary?.totalBoxCost || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
              </span>
          </div>
      </AnimatedModal>

    </div>
  );
}