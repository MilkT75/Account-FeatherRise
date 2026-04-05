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
    date: new Date().toISOString().split('T')[0],
    boxes: '',
    prepPartners: [], 
    sellPartners: []  
  });
  const [partnerSelectModal, setPartnerSelectModal] = useState({ isOpen: false, type: '' });

  // Delivery Wage Form
  const [deliveryForm, setDeliveryForm] = useState({
    date: new Date().toISOString().split('T')[0],
    totalTrips: '',
    tripsByPartner: {} 
  });
  const [deliverySelectModal, setDeliverySelectModal] = useState(false);

  // Categories
  const categories = {
    income: ['ขายสินค้า', 'เงินปันผล', 'รายรับอื่นๆ'],
    expense: ['ค่าแรง', 'ค่าจัดส่ง', 'ค่าวัตถุดิบ', 'ค่าเช่าที่', 'การตลาด', 'รายจ่ายอื่นๆ']
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
  // 5. Helper & Undo/Redo Functions
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

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // จำกัด 5MB
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

    // ถ้ายกเลิกรูปที่มีอยู่
    if (editingId && !receiptPreview) {
        finalReceiptUrl = null; 
    }

    // ถ้าอัปโหลดรูปใหม่
    if (receiptFile) {
        try {
            const storageRef = ref(storage, `receipts/${Date.now()}_${receiptFile.name}`);
            const snapshot = await uploadBytes(storageRef, receiptFile);
            finalReceiptUrl = await getDownloadURL(snapshot.ref);
        } catch (err) {
            console.error("Upload error:", err);
            alert("อัปโหลดสลิปล้มเหลว: " + err.message);
            setIsUploading(false);
            return;
        }
    }

    const payload = { 
        ...formData, 
        amount: Number(formData.amount), 
        receiptUrl: finalReceiptUrl,
        updatedAt: serverTimestamp() 
    };

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
      // เคลียร์ฟอร์ม
      setFormData({ type: formData.type, amount: '', category: '', date: new Date().toISOString().split('T')[0], note: '' });
      setReceiptFile(null);
      setReceiptPreview('');
    } catch (err) { 
        alert("เกิดข้อผิดพลาด: " + err.message); 
    }
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
  // 7. Partner / Wage Handlers 
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
        setPartnerModal({ isOpen: false, mode: '', data: null, value: '' });
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
          alert(`จ่ายค่าแรงให้ ${partner.name} สำเร็จแล้ว`);
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
  // 8. Advanced Wage Calculation (ทำไก่/ขายไก่)
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
        setWageSettingsModal({ isOpen: false, prepRate: '', sellRate: '', deliveryRate: '' });
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
          alert('คำนวณและเพิ่มยอดลงบัญชีหุ้นส่วนสำเร็จ');
      } catch (err) { alert('เกิดข้อผิดพลาด: ' + err.message); }
  };

  // ==========================================
  // 9. Delivery Wage Calculation (คำนวณค่าจัดส่ง)
  // ==========================================
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
         setDeliverySelectModal(false);
         alert('บันทึกค่าจัดส่งสำเร็จ');
     } catch (err) { alert('เกิดข้อผิดพลาด: ' + err.message); }
  };

  const handleDeleteWageLog = async (log) => {
    if(!isAdmin) return;
    if(!window.confirm("ต้องการลบประวัติการคำนวณนี้ใช่หรือไม่?\n(ยอดที่แจกจ่ายไปแล้วจะไม่ถูกดึงกลับอัตโนมัติ)")) return;
    await deleteDoc(doc(db, 'accounting_wage_logs', log.id));
    recordAction({ type: 'single', col: 'accounting_wage_logs', docId: log.id, oldData: log, newData: null });
  };

  // ==========================================
  // 10. Computations & Render
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

  const getPartnerStatement = (partner) => {
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
      <div className="bg-blue-600 text-white p-4 shadow-md sticky top-0 z-20">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <h1 className="text-lg md:text-xl font-bold flex items-center gap-2">
            <Wallet className="w-6 h-6" /> ระบบบัญชี
            {!isAdmin && <span className="bg-white/20 text-white text-xs px-2 py-0.5 rounded-full font-medium">โหมดผู้เยี่ยมชม</span>}
            {isAdmin && <span className="bg-green-400 text-white text-xs px-2 py-0.5 rounded-full font-medium shadow-sm">โหมดแอดมิน</span>}
          </h1>
          
          <div className="w-full sm:w-auto flex justify-end gap-2">
            {isAdmin && (
              <>
                <button onClick={handleUndo} disabled={undoStack.length === 0} className={`p-1.5 md:p-2 rounded-md flex items-center transition ${undoStack.length > 0 ? 'bg-blue-700 text-white hover:bg-blue-800' : 'bg-blue-500 text-blue-400 cursor-not-allowed'}`} title="ย้อนกลับ (Undo)">
                  <Undo size={16} />
                </button>
                <button onClick={handleRedo} disabled={redoStack.length === 0} className={`p-1.5 md:p-2 rounded-md flex items-center transition mr-1 ${redoStack.length > 0 ? 'bg-blue-700 text-white hover:bg-blue-800' : 'bg-blue-500 text-blue-400 cursor-not-allowed'}`} title="ทำซ้ำ (Redo)">
                  <Redo size={16} />
                </button>
              </>
            )}
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
        
        {/* Dashboard */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-green-500 flex flex-col justify-between items-center text-center">
            <p className="text-xs md:text-sm text-gray-500 font-medium">รายรับรวม</p>
            <p className="text-lg md:text-2xl font-bold text-green-600">฿{totals.income.toLocaleString()}</p>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-rose-500 flex flex-col justify-between items-center text-center">
            <p className="text-xs md:text-sm text-gray-500 font-medium">รายจ่ายรวม</p>
            <p className="text-lg md:text-2xl font-bold text-rose-600">฿{totals.expense.toLocaleString()}</p>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-blue-500 flex flex-col justify-between items-center text-center col-span-2 md:col-span-1">
            <p className="text-xs md:text-sm text-gray-500 font-medium">ยอดคงเหลือสุทธิ</p>
            <p className="text-lg md:text-2xl font-bold text-blue-600">฿{balance.toLocaleString()}</p>
          </div>

          <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-purple-500 flex flex-col justify-between items-center text-center">
            <p className="text-xs md:text-sm text-gray-500 font-medium w-full mb-1">มูลค่าทุนร้าน</p>
            <div className="flex items-center justify-center w-full">
              <span className="text-lg md:text-2xl font-bold text-purple-600 mr-1">฿</span>
              {isAdmin ? (
                <input 
                  type="number" min="0" step="any"
                  value={shopCapital}
                  onChange={(e) => setShopCapital(e.target.value === '' ? '' : Number(e.target.value))}
                  onBlur={(e) => handleCapitalUpdate(e.target.value)}
                  className="text-lg md:text-2xl font-bold text-purple-600 bg-transparent outline-none w-24 md:w-32 text-center border-b border-dashed border-gray-300 focus:border-purple-500"
                  placeholder="0"
                />
              ) : (
                <span className="text-lg md:text-2xl font-bold text-purple-600">{Number(shopCapital).toLocaleString()}</span>
              )}
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-orange-500 flex flex-col justify-between items-center text-center">
            <p className="text-xs md:text-sm text-gray-500 font-medium">ค่าแรงรอจ่ายรวม</p>
            <p className="text-lg md:text-2xl font-bold text-orange-600">฿{totalPendingWages.toLocaleString()}</p>
          </div>
          <div className={`bg-white p-4 rounded-xl shadow-sm border-l-4 ${netProfitLoss >= 0 ? 'border-teal-500' : 'border-red-600'} flex flex-col justify-between items-center text-center col-span-2 md:col-span-1`}>
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
                  <button 
                     onClick={() => setPartnerDetailsModal({ isOpen: true, partner })} 
                     className="absolute top-2 right-2 text-blue-300 hover:text-blue-600 transition-colors p-1"
                     title="ดูรายละเอียดการได้เงิน"
                  >
                     <Info className="w-4 h-4" />
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

        {/* ฟังก์ชันคำนวณค่าแรงแบบแอดวานซ์ (แสดงเฉพาะ Admin) */}
        {isAdmin && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            
            {/* กล่องทำไก่/ขายไก่ */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-orange-200 bg-gradient-to-br from-white to-orange-50/30">
              <div className="flex justify-between items-center mb-3 border-b border-orange-100 pb-2">
                <h2 className="text-sm md:text-base font-semibold text-orange-800 flex items-center gap-1.5">
                  <Calculator className="w-4 h-4" /> ค่าแรงยอดขาย (กล่อง)
                </h2>
                <button onClick={() => setWageSettingsModal({ isOpen: true, prepRate: wageSettings.prepRate, sellRate: wageSettings.sellRate, deliveryRate: wageSettings.deliveryRate })} className="text-orange-600 hover:text-orange-800 bg-orange-100 p-1.5 rounded transition" title="ตั้งค่าเรท">
                  <Settings className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-3">
                <div className="flex gap-2">
                   <input type="date" value={wageForm.date} onChange={e => setWageForm({...wageForm, date: e.target.value})} onClick={(e) => { try { e.target.showPicker() } catch(err){} }} className="w-1/2 p-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-orange-500 outline-none text-sm bg-white" />
                   <input type="number" min="0" placeholder="จำนวนกล่อง" value={wageForm.boxes} onChange={e => setWageForm({...wageForm, boxes: e.target.value})} className="w-1/2 p-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-orange-500 outline-none text-sm bg-white font-bold text-orange-600" />
                </div>
                <div className="flex gap-2">
                   <button type="button" onClick={() => setPartnerSelectModal({ isOpen: true, type: 'prep' })} className={`w-1/2 p-2 border rounded-lg text-sm flex flex-col items-center justify-center transition ${wageForm.prepPartners.length > 0 ? 'bg-orange-100 border-orange-300 text-orange-800' : 'bg-gray-50 border-gray-300 text-gray-500 hover:bg-gray-100'}`}>
                     <span className="flex items-center gap-1"><ChefHat className="w-3.5 h-3.5"/> ทำไก่</span>
                     <span className="font-bold">{wageForm.prepPartners.length} คน</span>
                   </button>
                   <button type="button" onClick={() => setPartnerSelectModal({ isOpen: true, type: 'sell' })} className={`w-1/2 p-2 border rounded-lg text-sm flex flex-col items-center justify-center transition ${wageForm.sellPartners.length > 0 ? 'bg-orange-100 border-orange-300 text-orange-800' : 'bg-gray-50 border-gray-300 text-gray-500 hover:bg-gray-100'}`}>
                     <span className="flex items-center gap-1"><ShoppingBag className="w-3.5 h-3.5"/> ขายไก่</span>
                     <span className="font-bold">{wageForm.sellPartners.length} คน</span>
                   </button>
                </div>
                <button onClick={handleCalculateWages} className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 rounded-lg text-sm transition shadow-sm">
                  คำนวณและแจกจ่าย
                </button>
              </div>
            </div>

            {/* กล่องจัดส่ง */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-purple-200 bg-gradient-to-br from-white to-purple-50/30">
              <div className="flex justify-between items-center mb-3 border-b border-purple-100 pb-2">
                <h2 className="text-sm md:text-base font-semibold text-purple-800 flex items-center gap-1.5">
                  <Truck className="w-4 h-4" /> ค่าแรงจัดส่ง (รอบ)
                </h2>
                <button onClick={() => setWageSettingsModal({ isOpen: true, prepRate: wageSettings.prepRate, sellRate: wageSettings.sellRate, deliveryRate: wageSettings.deliveryRate })} className="text-purple-600 hover:text-purple-800 bg-purple-100 p-1.5 rounded transition" title="ตั้งค่าเรท">
                  <Settings className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-3">
                <div className="flex gap-2">
                   <input type="date" value={deliveryForm.date} onChange={e => setDeliveryForm({...deliveryForm, date: e.target.value})} onClick={(e) => { try { e.target.showPicker() } catch(err){} }} className="w-1/2 p-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-purple-500 outline-none text-sm bg-white" />
                   <input type="number" min="0" placeholder="จำนวนรอบรวม" value={deliveryForm.totalTrips} onChange={e => setDeliveryForm({...deliveryForm, totalTrips: e.target.value})} className="w-1/2 p-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-purple-500 outline-none text-sm bg-white font-bold text-purple-600" />
                </div>
                <button type="button" onClick={() => setDeliverySelectModal(true)} className={`w-full p-2 border rounded-lg text-sm flex items-center justify-between transition ${Object.values(deliveryForm.tripsByPartner).reduce((a,b)=>a+b,0) > 0 ? 'bg-purple-100 border-purple-300 text-purple-800' : 'bg-gray-50 border-gray-300 text-gray-500 hover:bg-gray-100'}`}>
                  <span className="flex items-center gap-1"><Users className="w-4 h-4"/> เลือกคนส่งของ</span>
                  <span className="font-bold">{Object.values(deliveryForm.tripsByPartner).reduce((a,b)=>a+b,0)} / {deliveryForm.totalTrips || 0} รอบ</span>
                </button>
                <button onClick={handleCalculateDelivery} className="w-full bg-purple-500 hover:bg-purple-600 text-white font-bold py-2 rounded-lg text-sm transition shadow-sm">
                  คำนวณและแจกจ่าย
                </button>
              </div>
            </div>

          </div>
        )}

        {/* แสดงประวัติการคำนวณค่าแรง (แยกจากบัญชีหลัก) */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <button onClick={() => setIsWageHistoryOpen(!isWageHistoryOpen)} className="w-full p-4 bg-orange-50/50 hover:bg-orange-100/50 border-b border-orange-100 flex justify-between items-center transition">
            <div className="flex items-center gap-2">
               <History className="w-5 h-5 text-orange-600" />
               <h3 className="font-semibold text-orange-800">ประวัติคำนวณค่าแรง (กล่อง/จัดส่ง)</h3>
            </div>
            <div className="flex items-center gap-2">
               <span className="text-xs font-bold text-orange-600 bg-white px-3 py-1 rounded-full shadow-sm">{wageHistory.length} รายการ</span>
               {isWageHistoryOpen ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
            </div>
          </button>
          
          {isWageHistoryOpen && (
            <div className="max-h-60 overflow-y-auto bg-white p-2">
              {wageHistory.length === 0 ? (
                <p className="text-center py-6 text-gray-400 text-sm">ไม่พบประวัติการคำนวณ</p>
              ) : (
                <div className="space-y-2">
                  {wageHistory.map(log => (
                    <div key={log.id} className={`border rounded-lg p-3 text-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-2 transition ${log.logType === 'delivery' ? 'bg-purple-50/30 border-purple-100 hover:bg-purple-50' : 'bg-orange-50/30 border-orange-100 hover:bg-orange-50'}`}>
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
                        <button onClick={() => handleDeleteWageLog(log)} className="text-gray-400 hover:text-red-500 p-1.5 bg-white shadow-sm border border-gray-100 rounded md:ml-auto">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>


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
                
                {/* ระบบแนบสลิป */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">แนบสลิป/ใบเสร็จ (ไม่เกิน 5MB)</label>
                  <div className="flex items-center gap-3">
                    <label className={`flex items-center justify-center ${isUploading ? 'bg-gray-100 cursor-not-allowed' : 'bg-gray-50 hover:bg-gray-100 cursor-pointer'} text-gray-600 border border-gray-300 border-dashed rounded-lg p-2.5 transition w-full sm:w-auto`}>
                       <Camera className="w-5 h-5 mr-2" />
                       <span className="text-sm font-medium">{isUploading ? 'กำลังอัปโหลด...' : (receiptPreview ? 'เปลี่ยนรูป' : 'อัปโหลดรูปภาพ')}</span>
                       <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} disabled={isUploading} />
                    </label>
                    {receiptPreview && (
                       <div className="relative">
                          <img src={receiptPreview} alt="preview" className="h-12 w-12 object-cover rounded-md border border-gray-200 shadow-sm cursor-pointer" onClick={() => setReceiptViewModal({ isOpen: true, url: receiptPreview })} />
                          <button type="button" onClick={() => { setReceiptFile(null); setReceiptPreview(''); }} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 shadow-sm hover:bg-red-600">
                            <X className="w-3 h-3" />
                          </button>
                       </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <button type="submit" disabled={isUploading} className={`flex-1 ${isUploading ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'} text-white py-3 rounded-lg font-bold flex justify-center items-center gap-2 transition shadow-sm`}>
                  {isUploading ? <span className="animate-pulse">กำลังบันทึก...</span> : <><Check className="w-5 h-5" /> {editingId ? 'บันทึกการแก้ไขบัญชี' : 'บันทึกลงบัญชี'}</>}
                </button>
                {editingId && (
                  <button type="button" onClick={cancelEdit} disabled={isUploading} className="py-3 sm:px-6 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-medium flex justify-center items-center transition">ยกเลิกการแก้ไข</button>
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
              type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} onClick={(e) => { try { e.target.showPicker() } catch(err){} }}
              className="p-2 text-sm border border-gray-300 rounded-md outline-none focus:ring-1 focus:ring-blue-500 w-full bg-white text-gray-900"
            />
            <select 
              value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
              className="p-2 text-sm border border-gray-300 rounded-md outline-none focus:ring-1 focus:ring-blue-500 w-full bg-white text-gray-900"
            >
              <option value="">ทุกหมวดหมู่</option>
              {[...categories.income, ...categories.expense].map(cat => ( <option key={cat} value={cat}>{cat}</option> ))}
            </select>
          </div>
        </div>

        {/* Transaction History List (บัญชีหลัก) */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <button onClick={() => setIsMainHistoryOpen(!isMainHistoryOpen)} className="w-full p-4 bg-gray-50 hover:bg-gray-100 border-b border-gray-200 flex justify-between items-center transition">
            <div className="flex items-center gap-2">
               <History className="w-5 h-5 text-gray-600" />
               <h3 className="font-semibold text-gray-700">ประวัติบัญชีกองกลาง</h3>
            </div>
            <div className="flex items-center gap-2">
               <span className="text-xs font-bold text-gray-600 bg-white px-3 py-1 rounded-full border border-gray-200 shadow-sm">{filteredRecords.length} รายการ</span>
               {isMainHistoryOpen ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
            </div>
          </button>
          
          {isMainHistoryOpen && (
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
                        <div className="flex items-center gap-2">
                           <p className="font-semibold text-gray-800 text-sm md:text-base truncate">{record.category}</p>
                           {record.receiptUrl && (
                             <button onClick={() => setReceiptViewModal({ isOpen: true, url: record.receiptUrl })} className="text-blue-500 hover:text-blue-700" title="ดูสลิป">
                               <ImageIcon className="w-4 h-4" />
                             </button>
                           )}
                        </div>
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
          )}
        </div>

      </div>

      {/* ==================================================== */}
      {/* MODALS SECTION */}
      {/* ==================================================== */}
      
      {/* Modal ดูรูปสลิป */}
      {receiptViewModal.isOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[60] backdrop-blur-sm" onClick={() => setReceiptViewModal({ isOpen: false, url: '' })}>
          <div className="relative max-w-2xl w-full flex flex-col items-center">
            <button onClick={() => setReceiptViewModal({ isOpen: false, url: '' })} className="absolute -top-10 right-0 text-white hover:text-gray-300">
               <X className="w-8 h-8" />
            </button>
            <img src={receiptViewModal.url} alt="Receipt" className="max-h-[85vh] w-auto object-contain rounded-lg shadow-2xl" onClick={e => e.stopPropagation()} />
          </div>
        </div>
      )}

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

      {/* Modal ตั้งค่าเรทค่าแรง/ค่าส่ง */}
      {wageSettingsModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-800 border-b pb-3">
              <Settings className="text-orange-500" /> ตั้งค่าเรทค่าแรง & ค่าส่ง
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
                <div className="pt-2 border-t border-gray-100">
                  <label className="block text-sm font-medium text-gray-700 mb-1">ค่าจัดส่ง (บาท/รอบ)</label>
                  <input type="number" step="any" min="0" required
                    value={wageSettingsModal.deliveryRate} onChange={(e) => setWageSettingsModal({...wageSettingsModal, deliveryRate: e.target.value})}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none bg-white text-gray-900"
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-6 pt-2">
                <button type="button" onClick={() => setWageSettingsModal({ isOpen: false, prepRate: '', sellRate: '', deliveryRate: '' })} className="flex-1 py-2.5 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition">ยกเลิก</button>
                <button type="submit" className="flex-1 py-2.5 text-white bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-bold transition shadow-sm">บันทึกตั้งค่า</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal เลือกคนทำไก่ / ขายไก่ */}
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
                        type="checkbox" checked={isSelected}
                        onChange={() => togglePartnerSelection(p.id, partnerSelectModal.type)}
                        className="w-5 h-5 text-orange-600 rounded focus:ring-orange-500 cursor-pointer"
                      />
                      <span className={`font-medium ${isSelected ? 'text-orange-800' : 'text-gray-700'}`}>{p.name}</span>
                   </label>
                 );
              })}
            </div>
            
            <button type="button" onClick={() => setPartnerSelectModal({ isOpen: false, type: '' })} className="w-full py-3 text-white bg-gray-800 hover:bg-black rounded-lg text-sm font-bold transition shadow-sm shrink-0">ตกลง</button>
          </div>
        </div>
      )}

      {/* Modal เลือกคนส่งของ */}
      {deliverySelectModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold mb-1 flex items-center gap-2 text-gray-800 shrink-0">
              <Truck className="text-purple-500" /> ระบุรอบส่งของแต่ละคน
            </h3>
            <p className="text-sm text-gray-500 mb-4 border-b pb-3">รวมต้องได้ {deliveryForm.totalTrips || 0} รอบ (คุณสามารถแก้ยอดรวมหน้าก่อนนี้ได้)</p>
            
            <div className="overflow-y-auto flex-1 space-y-2 pr-2 mb-4">
              {partners.length === 0 ? <p className="text-center text-sm text-gray-400 py-4">ยังไม่มีรายชื่อพนักงาน</p> : null}
              {partners.map(p => {
                 const currentTrips = deliveryForm.tripsByPartner[p.id] || 0;
                 return (
                   <div key={p.id} className={`flex items-center justify-between p-2 rounded-lg border transition ${currentTrips > 0 ? 'border-purple-400 bg-purple-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                      <span className={`font-medium ml-2 ${currentTrips > 0 ? 'text-purple-800' : 'text-gray-700'}`}>{p.name}</span>
                      <div className="flex items-center gap-2">
                         <input 
                           type="number" min="0" step="1" placeholder="0"
                           value={currentTrips || ''}
                           onChange={(e) => handleDeliveryTripChange(p.id, e.target.value)}
                           className="w-16 p-1.5 text-center border border-gray-300 rounded focus:ring-1 focus:ring-purple-500 outline-none text-sm font-bold text-purple-600 bg-white"
                         />
                         <span className="text-xs text-gray-500 w-6">รอบ</span>
                      </div>
                   </div>
                 );
              })}
            </div>
            
            <div className="flex justify-between items-center bg-gray-50 p-3 rounded-lg mb-4 text-sm">
               <span className="font-medium text-gray-600">รวมที่กรอกแล้ว:</span>
               <span className={`font-bold ${Object.values(deliveryForm.tripsByPartner).reduce((a,b)=>a+b,0) === Number(deliveryForm.totalTrips) ? 'text-green-600' : 'text-red-500'}`}>
                  {Object.values(deliveryForm.tripsByPartner).reduce((a,b)=>a+b,0)} / {deliveryForm.totalTrips || 0}
               </span>
            </div>

            <button type="button" onClick={() => setDeliverySelectModal(false)} className="w-full py-3 text-white bg-gray-800 hover:bg-black rounded-lg text-sm font-bold transition shadow-sm shrink-0">ตกลง / ปิด</button>
          </div>
        </div>
      )}

      {/* Modal ดูประวัติส่วนตัว */}
      {partnerDetailsModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-blue-50/50 rounded-t-xl shrink-0">
               <h3 className="text-lg font-bold flex items-center gap-2 text-gray-800">
                 <Info className="text-blue-500 w-5 h-5" /> ประวัติยอดเงิน: {partnerDetailsModal.partner?.name}
               </h3>
               <button onClick={() => setPartnerDetailsModal({ isOpen: false, partner: null })} className="text-gray-400 hover:text-gray-600 p-1"><X className="w-5 h-5"/></button>
            </div>
            
            <div className="overflow-y-auto flex-1 p-4 bg-gray-50">
               {getPartnerStatement(partnerDetailsModal.partner).length === 0 ? (
                 <p className="text-center text-sm text-gray-400 py-10">ยังไม่มีประวัติการได้เงิน หรือการเบิกจ่าย</p>
               ) : (
                 <div className="space-y-2">
                   {getPartnerStatement(partnerDetailsModal.partner).map((stmt, idx) => (
                     <div key={idx} className={`p-3 rounded-lg border bg-white flex justify-between items-center shadow-sm ${stmt.isIncome ? 'border-l-4 border-l-orange-400' : 'border-l-4 border-l-blue-400'}`}>
                        <div>
                          <div className="font-semibold text-gray-800 text-sm">{stmt.text}</div>
                          <div className="text-xs text-gray-500 mt-0.5">{stmt.date}</div>
                        </div>
                        <div className={`font-bold ${stmt.isIncome ? 'text-orange-600' : 'text-blue-600'}`}>
                           {stmt.isIncome ? '+' : '-'}฿{stmt.amount.toLocaleString()}
                        </div>
                     </div>
                   ))}
                 </div>
               )}
            </div>
            
            <div className="p-4 border-t border-gray-100 bg-white rounded-b-xl shrink-0">
               <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-600">ยอดรอจ่ายปัจจุบัน:</span>
                  <span className="text-lg font-bold text-gray-800">฿{(partnerDetailsModal.partner?.pendingWage || 0).toLocaleString()}</span>
               </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}