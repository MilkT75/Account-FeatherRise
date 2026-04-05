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
  Undo, Redo, ChevronDown, ChevronUp, Info, Truck, Camera, Image as ImageIcon
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

// ==========================================
// 2. ตั้งค่าระบบ Security & Webhook
// ==========================================
const GOOGLE_SHEET_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbxMeGK6Bzv9FyIc6jlsMPWCtUqxyppxmD4eLTnUtkkrBHRFuwKluWsbOroYf_FF8Bae8A/exec";
const ADMIN_PIN = "842019";

// สไตล์ของ Scrollbar แบบมินิมอล (สไตล์ iOS)
const scrollbarClass = "[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-gray-400";

// ==========================================
// 3. iOS Animated Modal Component
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
  
  // Undo / Redo Stacks
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  // UI Collapse States
  const [isMainHistoryOpen, setIsMainHistoryOpen] = useState(true);
  const [isWageHistoryOpen, setIsWageHistoryOpen] = useState(true);

  // Main Accounting Form State
  const [formData, setFormData] = useState({
    type: 'income', amount: '', category: '',
    date: new Date().toISOString().split('T')[0], note: ''
  });
  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState('');
  const [receiptViewModal, setReceiptViewModal] = useState({ isOpen: false, url: '' });
  
  // Edit & Filter State
  const [editingId, setEditingId] = useState(null);
  const [filterMonth, setFilterMonth] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  // Partner & Wage Calculation State
  const [partnerModal, setPartnerModal] = useState({ isOpen: false, mode: '', data: null, value: '' });
  const [partnerDetailsModal, setPartnerDetailsModal] = useState({ isOpen: false, partner: null });
  
  // Settings
  const [wageSettings, setWageSettings] = useState({ prepRate: 0, sellRate: 0, deliveryRate: 0 });
  const [wageSettingsModal, setWageSettingsModal] = useState({ isOpen: false, prepRate: '', sellRate: '', deliveryRate: '' });
  const [wageHistory, setWageHistory] = useState([]); 
  
  // Box Wage Form
  const [wageForm, setWageForm] = useState({
    date: new Date().toISOString().split('T')[0], boxes: '', prepPartners: [], sellPartners: []  
  });
  const [partnerSelectModal, setPartnerSelectModal] = useState({ isOpen: false, type: '' });

  // Delivery Wage Form
  const [deliveryForm, setDeliveryForm] = useState({
    date: new Date().toISOString().split('T')[0], totalTrips: '', tripsByPartner: {} 
  });
  const [deliverySelectModal, setDeliverySelectModal] = useState({ isOpen: false });

  // Categories
  const categories = {
    income: ['ขายสินค้า', 'เงินปันผล', 'รายรับอื่นๆ'],
    expense: ['ค่าแรง', 'ค่าจัดส่ง', 'ค่าวัตถุดิบ', 'ค่าเช่าที่', 'การตลาด', 'รายจ่ายอื่นๆ']
  };

  // ==========================================
  // Effects & Auth
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
      else setWageSettings({ prepRate: 0, sellRate: 0, deliveryRate: 0 });
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
    setUndoStack([]);
    setRedoStack([]);
  };

  // ==========================================
  // Helper & Undo/Redo Functions
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

    if (action.type === 'single') {
        applyToBatch(action);
    } else if (action.type === 'batch') {
        action.items.forEach(applyToBatch);
    }
    await batch.commit();
  };

  const handleUndo = async () => {
    if (undoStack.length === 0 || !user || !db || !isAdmin) return;
    const action = undoStack[undoStack.length - 1];
    try {
        await processUndoRedo(action, true);
        setUndoStack(prev => prev.slice(0, -1));
        setRedoStack(prev => [...prev, action]);
    } catch(err) { alert("Undo failed: "+err.message); }
  };

  const handleRedo = async () => {
    if (redoStack.length === 0 || !user || !db || !isAdmin) return;
    const action = redoStack[redoStack.length - 1];
    try {
        await processUndoRedo(action, false);
        setRedoStack(prev => prev.slice(0, -1));
        setUndoStack(prev => [...prev, action]);
    } catch(err) { alert("Redo failed: "+err.message); }
  };

  // ==========================================
  // Accounting Handlers (บัญชีหลัก)
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
      if (file.size > 5 * 1024 * 1024) { 
        alert("ไฟล์ใหญ่เกินไป (ต้องไม่เกิน 5MB)");
        return;
      }
      setReceiptFile(file);
      setReceiptPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user || !db || !isAdmin) { alert('คุณไม่มีสิทธิ์แก้ไขข้อมูล'); return; }
    if (!formData.amount || Number(formData.amount) <= 0) { alert('ระบุจำนวนเงินให้ถูกต้อง'); return; }
    if (!formData.category) { alert('กรุณาเลือกหมวดหมู่'); return; }
    if (!formData.date) { alert('กรุณาระบุวันที่'); return; }

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
      setReceiptFile(null);
      setReceiptPreview('');
    } catch (err) { alert("เกิดข้อผิดพลาด: " + err.message); }
    setIsUploading(false);
  };

  const handleEdit = (record) => {
    if(!isAdmin) return;
    setEditingId(record.id);
    setFormData({ type: record.type, amount: record.amount.toString(), category: record.category, date: record.date, note: record.note || '' });
    setReceiptFile(null);
    setReceiptPreview(record.receiptUrl || '');
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
    setReceiptFile(null);
    setReceiptPreview('');
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
            deliveryRate: Number(wageSettingsModal.deliveryRate) || 0
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

     setDeliveryForm(prev => ({
         ...prev,
         tripsByPartner: { ...prev.tripsByPartner, [partnerId]: value }
     }));
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
         setDeliverySelectModal({ isOpen: false });
     } catch (err) { alert('เกิดข้อผิดพลาด: ' + err.message); }
  };

  const handleDeleteWageLog = async (log) => {
    if(!isAdmin) return;
    if(!window.confirm("ต้องการลบประวัติการคำนวณนี้ใช่หรือไม่?\n(ยอดที่แจกจ่ายไปแล้วจะไม่ถูกดึงกลับอัตโนมัติ)")) return;
    await deleteDoc(doc(db, 'accounting_wage_logs', log.id));
    recordAction({ type: 'single', col: 'accounting_wage_logs', docId: log.id, oldData: log, newData: null });
  };

  // ==========================================
  // Computations
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
  const dividendPerPerson = partners.length > 0 ? (netProfitLoss / partners.length) : 0;

  const getPartnerStatement = (partner) => {
      if (!partner) return [];
      let stmts = [];
      wageHistory.forEach(log => {
          if (log.logType === 'delivery') {
              const d = log.deliveryDetails?.find(x => x.name === partner.name);
              if (d) stmts.push({ date: log.date, text: `ค่าจัดส่ง (${d.trips} รอบ)`, amount: d.amount, isIncome: true, realDate: log.createdAt });
          } else {
              let amount = 0; let text = [];
              if (log.prepNames?.includes(partner.name)) { amount += log.prepTotal / log.prepNames.length; text.push('ทำไก่'); }
              if (log.sellNames?.includes(partner.name)) { amount += log.sellTotal / log.sellNames.length; text.push('ขายไก่'); }
              if (amount > 0) stmts.push({ date: log.date, text: `ค่าแรง: ${text.join(' + ')} (ยอดขาย ${log.boxes} กล่อง)`, amount, isIncome: true, realDate: log.createdAt });
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
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900 pb-20">
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
          <div className="bg-white p-4 rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 border-l-4 border-orange-500 flex flex-col justify-between items-center text-center">
            <p className="text-xs md:text-sm text-gray-500 font-medium">ค่าแรงรอจ่ายรวม</p>
            <p className="text-lg md:text-2xl font-bold text-orange-600">฿{totalPendingWages.toLocaleString()}</p>
          </div>
          <div className={`bg-white p-4 rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 border-l-4 ${netProfitLoss >= 0 ? 'border-teal-500' : 'border-red-600'} flex flex-col justify-between items-center text-center col-span-2 md:col-span-1`}>
            <p className="text-xs md:text-sm text-gray-500 font-medium">สถานะร้าน (กำไร/ขาดทุน)</p>
            <p className={`text-lg md:text-2xl font-bold ${netProfitLoss >= 0 ? 'text-teal-600' : 'text-red-600'}`}>
              {netProfitLoss >= 0 ? '+' : ''}฿{netProfitLoss.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 2})}
            </p>
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
                          className="flex items-center justify-center gap-1.5 w-full bg-white text-gray-600 border border-gray-200 py-1.5 rounded-xl text-xs font-medium hover:bg-gray-50 active:scale-[0.97] transition-all duration-200 shadow-sm"
                        >
                          <Settings className="w-3.5 h-3.5" /> ตั้งยอดค่าแรง
                        </button>
                        <button 
                          onClick={() => handlePayWage(partner)}
                          disabled={!partner.pendingWage || partner.pendingWage <= 0}
                          className="flex items-center justify-center gap-1.5 w-full bg-blue-50 text-blue-600 border border-blue-200 py-1.5 rounded-xl text-xs font-bold hover:bg-blue-600 hover:text-white active:scale-[0.97] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 shadow-sm"
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            
            {/* กล่องทำไก่/ขายไก่ */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-orange-200 bg-gradient-to-br from-white to-orange-50/30 transition-all duration-300">
              <div className="flex justify-between items-center mb-3 border-b border-orange-100 pb-2">
                <h2 className="text-sm md:text-base font-semibold text-orange-800 flex items-center gap-1.5">
                  <Calculator className="w-4 h-4" /> ค่าแรงยอดขาย (กล่อง)
                </h2>
                <button onClick={() => setWageSettingsModal({ isOpen: true, prepRate: wageSettings.prepRate, sellRate: wageSettings.sellRate, deliveryRate: wageSettings.deliveryRate })} className="text-orange-600 hover:text-orange-800 bg-orange-100 hover:bg-orange-200 active:scale-90 p-1.5 rounded-lg transition-all duration-200" title="ตั้งค่าเรท">
                  <Settings className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-3">
                <div className="flex gap-2">
                   <input type="date" value={wageForm.date} onChange={e => setWageForm({...wageForm, date: e.target.value})} onClick={(e) => { try { e.target.showPicker() } catch(err){} }} className="w-1/2 p-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-sm bg-white transition-all duration-200" />
                   <input type="number" min="0" placeholder="จำนวนกล่อง" value={wageForm.boxes} onChange={e => setWageForm({...wageForm, boxes: e.target.value})} className="w-1/2 p-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-sm bg-white font-bold text-orange-600 transition-all duration-200" />
                </div>
                <div className="flex gap-2">
                   <button type="button" onClick={() => setPartnerSelectModal({ isOpen: true, type: 'prep' })} className={`w-1/2 p-2 border rounded-xl text-sm flex flex-col items-center justify-center active:scale-[0.97] transition-all duration-200 shadow-sm ${wageForm.prepPartners.length > 0 ? 'bg-orange-100 border-orange-300 text-orange-800' : 'bg-gray-50 border-gray-300 text-gray-500 hover:bg-gray-100'}`}>
                     <span className="flex items-center gap-1"><ChefHat className="w-3.5 h-3.5"/> ทำไก่</span>
                     <span className="font-bold">{wageForm.prepPartners.length} คน</span>
                   </button>
                   <button type="button" onClick={() => setPartnerSelectModal({ isOpen: true, type: 'sell' })} className={`w-1/2 p-2 border rounded-xl text-sm flex flex-col items-center justify-center active:scale-[0.97] transition-all duration-200 shadow-sm ${wageForm.sellPartners.length > 0 ? 'bg-orange-100 border-orange-300 text-orange-800' : 'bg-gray-50 border-gray-300 text-gray-500 hover:bg-gray-100'}`}>
                     <span className="flex items-center gap-1"><ShoppingBag className="w-3.5 h-3.5"/> ขายไก่</span>
                     <span className="font-bold">{wageForm.sellPartners.length} คน</span>
                   </button>
                </div>
                <button onClick={handleCalculateWages} className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 rounded-xl text-sm active:scale-[0.98] transition-all duration-200 shadow-md">
                  คำนวณและแจกจ่าย
                </button>
              </div>
            </div>

            {/* กล่องจัดส่ง */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-purple-200 bg-gradient-to-br from-white to-purple-50/30 transition-all duration-300">
              <div className="flex justify-between items-center mb-3 border-b border-purple-100 pb-2">
                <h2 className="text-sm md:text-base font-semibold text-purple-800 flex items-center gap-1.5">
                  <Truck className="w-4 h-4" /> ค่าแรงจัดส่ง (รอบ)
                </h2>
                <button onClick={() => setWageSettingsModal({ isOpen: true, prepRate: wageSettings.prepRate, sellRate: wageSettings.sellRate, deliveryRate: wageSettings.deliveryRate })} className="text-purple-600 hover:text-purple-800 bg-purple-100 hover:bg-purple-200 active:scale-90 p-1.5 rounded-lg transition-all duration-200" title="ตั้งค่าเรท">
                  <Settings className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-3">
                <div className="flex gap-2">
                   <input type="date" value={deliveryForm.date} onChange={e => setDeliveryForm({...deliveryForm, date: e.target.value})} onClick={(e) => { try { e.target.showPicker() } catch(err){} }} className="w-1/2 p-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-sm bg-white transition-all duration-200" />
                   <input type="number" min="0" placeholder="จำนวนรอบรวม" value={deliveryForm.totalTrips} onChange={e => setDeliveryForm({...deliveryForm, totalTrips: e.target.value})} className="w-1/2 p-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-sm bg-white font-bold text-purple-600 transition-all duration-200" />
                </div>
                <button type="button" onClick={() => setDeliverySelectModal({ isOpen: true })} className={`w-full p-2 border rounded-xl text-sm flex items-center justify-between active:scale-[0.98] transition-all duration-200 shadow-sm ${Object.values(deliveryForm.tripsByPartner).reduce((a,b)=>a+b,0) > 0 ? 'bg-purple-100 border-purple-300 text-purple-800' : 'bg-gray-50 border-gray-300 text-gray-500 hover:bg-gray-100'}`}>
                  <span className="flex items-center gap-1"><Users className="w-4 h-4"/> เลือกคนส่งของ</span>
                  <span className="font-bold">{Object.values(deliveryForm.tripsByPartner).reduce((a,b)=>a+b,0)} / {deliveryForm.totalTrips || 0} รอบ</span>
                </button>
                <button onClick={handleCalculateDelivery} className="w-full bg-purple-500 hover:bg-purple-600 text-white font-bold py-2 rounded-xl text-sm active:scale-[0.98] transition-all duration-200 shadow-md">
                  คำนวณและแจกจ่าย
                </button>
              </div>
            </div>

          </div>
        )}

        {/* แสดงประวัติการคำนวณค่าแรง (แยกจากบัญชีหลัก) */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden transition-all duration-300">
          <button onClick={() => setIsWageHistoryOpen(!isWageHistoryOpen)} className="w-full p-4 bg-orange-50/50 hover:bg-orange-100/50 border-b border-orange-100 flex justify-between items-center transition-colors duration-200">
            <div className="flex items-center gap-2">
               <History className="w-5 h-5 text-orange-600" />
               <h3 className="font-semibold text-orange-800">ประวัติคำนวณค่าแรง (กล่อง/จัดส่ง)</h3>
            </div>
            <div className="flex items-center gap-2">
               <span className="text-xs font-bold text-orange-600 bg-white px-3 py-1 rounded-full shadow-sm">{wageHistory.length} รายการ</span>
               <ChevronDown className={`w-5 h-5 text-orange-400 transition-transform duration-300 ease-out ${isWageHistoryOpen ? 'rotate-180' : ''}`} />
            </div>
          </button>
          
          <div className={`overflow-hidden transition-all duration-300 ease-out ${isWageHistoryOpen ? 'max-h-[100vh] opacity-100' : 'max-h-0 opacity-0'}`}>
            <div className={`max-h-96 overflow-y-auto bg-white p-3 ${scrollbarClass}`}>
              {wageHistory.length === 0 ? (
                <p className="text-center py-6 text-gray-400 text-sm">ไม่พบประวัติการคำนวณ</p>
              ) : (
                <div className="space-y-3">
                  {wageHistory.map(log => (
                    <div key={log.id} className={`border rounded-2xl p-3.5 text-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-2 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${log.logType === 'delivery' ? 'bg-purple-50/30 border-purple-100 hover:bg-purple-50' : 'bg-orange-50/30 border-orange-100 hover:bg-orange-50'}`}>
                      <div>
                        <span className="font-bold text-gray-800">{log.date}</span>
                        <span className="mx-2 text-gray-300">|</span>
                        
                        {log.logType === 'delivery' ? (
                           <span className="text-purple-600 font-medium">ส่งของรวม {log.totalTrips} รอบ</span>
                        ) : (
                           <span className="text-orange-600 font-medium">ยอดขาย {log.boxes} กล่อง</span>
                        )}

                        <div className="text-xs text-gray-500 mt-1">
                          {log.logType === 'delivery' ? (
                             <span><Truck className="w-3 h-3 inline mr-1 text-gray-400"/> คนส่ง: {log.deliveryDetails?.map(d => `${d.name}(${d.trips})`).join(', ')} (รวม ฿{log.totalAmount})</span>
                          ) : (
                             <>
                               {log.prepNames?.length > 0 && <span><ChefHat className="w-3 h-3 inline mr-1 text-gray-400"/> ทำไก่: {log.prepNames.join(', ')} (รวม ฿{log.prepTotal})</span>}
                               {log.prepNames?.length > 0 && log.sellNames?.length > 0 && <span className="mx-1 text-gray-300">|</span>}
                               {log.sellNames?.length > 0 && <span><ShoppingBag className="w-3 h-3 inline mr-1 text-gray-400"/> ขายไก่: {log.sellNames.join(', ')} (รวม ฿{log.sellTotal})</span>}
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
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>


        {/* Input Form บัญชีหลัก (ซ่อนถ้าไม่ใช่ Admin) */}
        {isAdmin && (
          <div id="record-form" className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-gray-200 animate-in fade-in duration-500">
            <h2 className="text-base md:text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              {editingId ? <Edit2 className="w-5 h-5 text-yellow-500" /> : <PlusCircle className="w-5 h-5 text-blue-500" />}
              {editingId ? 'แก้ไขรายการบัญชี' : 'บันทึกรายการบัญชีกองกลาง'}
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-4 md:space-y-5">
              <div className="grid grid-cols-2 gap-3 md:gap-4">
                <button type="button" onClick={() => handleInputChange({ target: { name: 'type', value: 'income' } })} className={`py-3 rounded-xl font-bold flex justify-center items-center gap-2 active:scale-[0.98] transition-all duration-200 ${formData.type === 'income' ? 'bg-green-500 text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                  <PlusCircle className="w-5 h-5" /> รายรับ
                </button>
                <button type="button" onClick={() => handleInputChange({ target: { name: 'type', value: 'expense' } })} className={`py-3 rounded-xl font-bold flex justify-center items-center gap-2 active:scale-[0.98] transition-all duration-200 ${formData.type === 'expense' ? 'bg-red-500 text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                  <MinusCircle className="w-5 h-5" /> รายจ่าย
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">จำนวนเงิน (บาท)*</label>
                  <input type="number" name="amount" min="0" step="any" value={formData.amount} onChange={handleInputChange} className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900 shadow-sm transition-all duration-200" placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">หมวดหมู่*</label>
                  <select name="category" value={formData.category} onChange={handleInputChange} className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900 shadow-sm transition-all duration-200">
                    <option value="" disabled>-- เลือกหมวดหมู่ --</option>
                    {categories[formData.type].map(cat => ( <option key={cat} value={cat}>{cat}</option> ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">วันที่*</label>
                  <input type="date" name="date" value={formData.date} onChange={handleInputChange} onClick={(e) => { try { e.target.showPicker() } catch(err){} }} className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900 shadow-sm transition-all duration-200" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ</label>
                  <input type="text" name="note" value={formData.note} onChange={handleInputChange} className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900 shadow-sm transition-all duration-200" placeholder="ระบุเพิ่มเติม..." />
                </div>
                
                {/* ระบบแนบสลิป */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">แนบสลิป/ใบเสร็จ (ไม่เกิน 5MB)</label>
                  <div className="flex items-center gap-3">
                    <label className={`flex items-center justify-center ${isUploading ? 'bg-gray-100 cursor-not-allowed' : 'bg-gray-50 hover:bg-gray-100 cursor-pointer'} text-gray-600 border border-gray-300 border-dashed rounded-xl p-3 transition-all duration-200 w-full sm:w-auto active:scale-[0.98]`}>
                       <Camera className="w-5 h-5 mr-2" />
                       <span className="text-sm font-medium">{isUploading ? 'กำลังอัปโหลด...' : (receiptPreview ? 'เปลี่ยนรูป' : 'อัปโหลดรูปภาพ')}</span>
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

        {/* Filters */}
        <div className="flex flex-col sm:flex-row items-center gap-2 bg-white p-3 md:p-4 rounded-2xl shadow-sm border border-gray-200 transition-all duration-300">
          <div className="flex items-center gap-2 w-full sm:w-auto text-gray-500 font-medium">
             <Filter className="w-5 h-5" /> ตัวกรอง:
          </div>
          <div className="flex gap-2 w-full">
            <input 
              type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} onClick={(e) => { try { e.target.showPicker() } catch(err){} }}
              className="p-2 text-sm border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 w-full bg-white text-gray-900 transition-all duration-200"
            />
            <select 
              value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
              className="p-2 text-sm border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 w-full bg-white text-gray-900 transition-all duration-200"
            >
              <option value="">ทุกหมวดหมู่</option>
              {[...categories.income, ...categories.expense].map(cat => ( <option key={cat} value={cat}>{cat}</option> ))}
            </select>
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
                  className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50 text-gray-900 transition-all duration-200"
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

      {/* Modal ตั้งค่าเรทค่าแรง/ค่าส่ง */}
      <AnimatedModal isOpen={wageSettingsModal.isOpen} onClose={() => setWageSettingsModal(prev => ({ ...prev, isOpen: false }))}>
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-800 border-b pb-3">
            <Settings className="text-orange-500" /> ตั้งค่าเรทค่าแรง & ค่าส่ง
          </h3>
          <form onSubmit={handleSaveWageSettings}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ค่าแรงทำไก่ (บาท/กล่อง)</label>
                <input type="number" step="any" min="0" required
                  value={wageSettingsModal.prepRate} onChange={(e) => setWageSettingsModal({...wageSettingsModal, prepRate: e.target.value})}
                  className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none bg-gray-50 text-gray-900 transition-all duration-200"
                  placeholder="0.00" autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ค่าแรงขายไก่ (บาท/กล่อง)</label>
                <input type="number" step="any" min="0" required
                  value={wageSettingsModal.sellRate} onChange={(e) => setWageSettingsModal({...wageSettingsModal, sellRate: e.target.value})}
                  className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none bg-gray-50 text-gray-900 transition-all duration-200"
                  placeholder="0.00"
                />
              </div>
              <div className="pt-2 border-t border-gray-100">
                <label className="block text-sm font-medium text-gray-700 mb-1">ค่าจัดส่ง (บาท/รอบ)</label>
                <input type="number" step="any" min="0" required
                  value={wageSettingsModal.deliveryRate} onChange={(e) => setWageSettingsModal({...wageSettingsModal, deliveryRate: e.target.value})}
                  className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none bg-gray-50 text-gray-900 transition-all duration-200"
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6 pt-2">
              <button type="button" onClick={() => setWageSettingsModal({ isOpen: false, prepRate: '', sellRate: '', deliveryRate: '' })} className="flex-1 py-3 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium active:scale-[0.97] transition-all duration-200">ยกเลิก</button>
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
                         className="w-16 p-2 text-center border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm font-bold text-purple-600 bg-white transition-all"
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

      {/* Modal ดูประวัติส่วนตัว (Face Card Details) */}
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

    </div>
  );
}