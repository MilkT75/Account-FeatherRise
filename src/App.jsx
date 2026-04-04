import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import {
  getFirestore,
  collection,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  serverTimestamp,
  query,
  orderBy,
} from 'firebase/firestore';
import {
  PlusCircle,
  MinusCircle,
  Wallet,
  Trash2,
  Edit2,
  X,
  Check,
  Filter,
} from 'lucide-react';

// ==========================================
// 1. Firebase & Config
// ==========================================
const firebaseConfig = {
  apiKey: 'AIzaSyAZyh-2I-_86i8JAh-BAfy__skTXTAZOeA',
  authDomain: 'inventory-new-featherrise.firebaseapp.com',
  projectId: 'inventory-new-featherrise',
  storageBucket: 'inventory-new-featherrise.firebasestorage.app',
  messagingSenderId: '519862097911',
  appId: '1:519862097911:web:7e4c791dd1694e495200f2',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ใส่ URL ของ Google Apps Script (Webhook) ที่นี่
const GOOGLE_SHEET_WEBHOOK_URL = '';

// ==========================================
// 2. Main Component
// ==========================================
export default function App() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [formData, setFormData] = useState({
    type: 'income',
    amount: '',
    category: '',
    date: new Date().toISOString().split('T')[0],
    note: '',
  });

  // Edit State
  const [editingId, setEditingId] = useState(null);

  // Filter State
  const [filterMonth, setFilterMonth] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  // Categories (ตัวอย่าง)
  const categories = {
    income: ['ขายสินค้า', 'เงินปันผล', 'รายรับอื่นๆ'],
    expense: ['ค่าวัตถุดิบ', 'ค่าแรง', 'ค่าเช่าที่', 'การตลาด', 'รายจ่ายอื่นๆ'],
  };

  // ==========================================
  // 3. Effects & Firebase Listeners
  // ==========================================
  useEffect(() => {
    // Login Anonymously เพื่อให้อ่าน/เขียน Database ได้
    signInAnonymously(auth).catch((error) => {
      console.error('Auth Error:', error);
    });

    // ฟังการเปลี่ยนแปลงข้อมูลแบบ Real-time
    const q = query(
      collection(db, 'accounting_records'),
      orderBy('date', 'desc'),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setRecords(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // ==========================================
  // 4. Helper Functions
  // ==========================================
  const sendWebhook = (action, data) => {
    if (!GOOGLE_SHEET_WEBHOOK_URL) return;

    // โยนข้อมูลไป Google Sheet แบบ no-cors ป้องกันปัญหาเรื่อง Origin
    fetch(GOOGLE_SHEET_WEBHOOK_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        ...data,
        timestamp: new Date().toISOString(),
      }),
    }).catch((err) => console.error('Webhook error:', err));
  };

  const logAction = async (action, data) => {
    try {
      await addDoc(collection(db, 'accounting_logs'), {
        action,
        data,
        timestamp: serverTimestamp(),
      });
      sendWebhook(action, data);
    } catch (e) {
      console.error('Log error:', e);
    }
  };

  // ==========================================
  // 5. Handlers
  // ==========================================
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      const newData = { ...prev, [name]: value };
      // รีเซ็ตหมวดหมู่ถ้าเปลี่ยนประเภท
      if (name === 'type') newData.category = '';
      return newData;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.amount || !formData.date || !formData.category) return;

    const payload = {
      ...formData,
      amount: Number(formData.amount),
      updatedAt: serverTimestamp(),
    };

    try {
      if (editingId) {
        // แก้ไขข้อมูล
        const docRef = doc(db, 'accounting_records', editingId);
        await updateDoc(docRef, payload);
        await logAction('UPDATE', { id: editingId, ...payload });
        setEditingId(null);
      } else {
        // เพิ่มข้อมูลใหม่
        payload.createdAt = serverTimestamp();
        const docRef = await addDoc(
          collection(db, 'accounting_records'),
          payload
        );
        await logAction('CREATE', { id: docRef.id, ...payload });
      }

      // Reset Form
      setFormData({
        type: 'income',
        amount: '',
        category: '',
        date: new Date().toISOString().split('T')[0],
        note: '',
      });
    } catch (err) {
      console.error('Save error:', err);
      alert('เกิดข้อผิดพลาดในการบันทึก');
    }
  };

  const handleEdit = (record) => {
    setEditingId(record.id);
    setFormData({
      type: record.type,
      amount: record.amount.toString(),
      category: record.category,
      date: record.date,
      note: record.note || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id, recordData) => {
    if (
      !window.confirm(
        'ต้องการลบรายการนี้ใช่หรือไม่? (สามารถดูประวัติการลบได้ใน Logs)'
      )
    )
      return;
    try {
      await deleteDoc(doc(db, 'accounting_records', id));
      await logAction('DELETE', { id, ...recordData });
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormData({
      type: 'income',
      amount: '',
      category: '',
      date: new Date().toISOString().split('T')[0],
      note: '',
    });
  };

  // ==========================================
  // 6. Calculations & Filtering
  // ==========================================
  const filteredRecords = records.filter((record) => {
    const matchMonth = filterMonth ? record.date.startsWith(filterMonth) : true;
    const matchCategory = filterCategory
      ? record.category === filterCategory
      : true;
    return matchMonth && matchCategory;
  });

  const totals = filteredRecords.reduce(
    (acc, curr) => {
      if (curr.type === 'income') acc.income += curr.amount;
      if (curr.type === 'expense') acc.expense += curr.amount;
      return acc;
    },
    { income: 0, expense: 0 }
  );
  const balance = totals.income - totals.expense;

  // ==========================================
  // 7. Render
  // ==========================================
  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center">
        กำลังโหลดระบบบัญชี...
      </div>
    );

  return (
    <div className="min-h-screen bg-gray-100 text-gray-800 pb-20">
      {/* Header */}
      <div className="bg-blue-600 text-white p-4 shadow-md sticky top-0 z-10">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Wallet className="w-6 h-6" /> ระบบบัญชี (Accounting)
        </h1>
      </div>

      <div className="max-w-3xl mx-auto p-4 space-y-6">
        {/* Dashboard */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white p-3 rounded-xl shadow-sm border-l-4 border-green-500">
            <p className="text-xs text-gray-500 mb-1">รายรับ</p>
            <p className="text-sm md:text-lg font-bold text-green-600">
              ฿{totals.income.toLocaleString()}
            </p>
          </div>
          <div className="bg-white p-3 rounded-xl shadow-sm border-l-4 border-red-500">
            <p className="text-xs text-gray-500 mb-1">รายจ่าย</p>
            <p className="text-sm md:text-lg font-bold text-red-600">
              ฿{totals.expense.toLocaleString()}
            </p>
          </div>
          <div className="bg-white p-3 rounded-xl shadow-sm border-l-4 border-blue-500">
            <p className="text-xs text-gray-500 mb-1">คงเหลือ</p>
            <p className="text-sm md:text-lg font-bold text-blue-600">
              ฿{balance.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Input Form */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            {editingId ? (
              <Edit2 className="w-5 h-5 text-yellow-500" />
            ) : (
              <PlusCircle className="w-5 h-5 text-blue-500" />
            )}
            {editingId ? 'แก้ไขรายการ' : 'บันทึกรายการใหม่'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() =>
                  handleInputChange({
                    target: { name: 'type', value: 'income' },
                  })
                }
                className={`py-2 rounded-lg font-medium flex justify-center items-center gap-1 ${
                  formData.type === 'income'
                    ? 'bg-green-500 text-white shadow-inner'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                <PlusCircle className="w-4 h-4" /> รายรับ
              </button>
              <button
                type="button"
                onClick={() =>
                  handleInputChange({
                    target: { name: 'type', value: 'expense' },
                  })
                }
                className={`py-2 rounded-lg font-medium flex justify-center items-center gap-1 ${
                  formData.type === 'expense'
                    ? 'bg-red-500 text-white shadow-inner'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                <MinusCircle className="w-4 h-4" /> รายจ่าย
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  จำนวนเงิน (บาท)*
                </label>
                <input
                  type="number"
                  name="amount"
                  required
                  min="0"
                  step="0.01"
                  value={formData.amount}
                  onChange={handleInputChange}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  หมวดหมู่*
                </label>
                <select
                  name="category"
                  required
                  value={formData.category}
                  onChange={handleInputChange}
                  className="w-full p-2 border rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="" disabled>
                    -- เลือกหมวดหมู่ --
                  </option>
                  {categories[formData.type].map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  วันที่*
                </label>
                <input
                  type="date"
                  name="date"
                  required
                  value={formData.date}
                  onChange={handleInputChange}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  หมายเหตุ
                </label>
                <input
                  type="text"
                  name="note"
                  value={formData.note}
                  onChange={handleInputChange}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="ระบุเพิ่มเติม..."
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-bold flex justify-center items-center gap-2 active:bg-blue-700"
              >
                <Check className="w-5 h-5" />{' '}
                {editingId ? 'บันทึกการแก้ไข' : 'บันทึกข้อมูล'}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="px-4 bg-gray-200 text-gray-700 rounded-lg font-medium active:bg-gray-300 flex justify-center items-center"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 bg-white p-3 rounded-xl shadow-sm border border-gray-200">
          <Filter className="w-5 h-5 text-gray-400" />
          <input
            type="month"
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="p-1.5 text-sm border rounded-md outline-none focus:border-blue-500 w-full"
          />
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="p-1.5 text-sm border rounded-md outline-none focus:border-blue-500 bg-white w-full"
          >
            <option value="">ทุกหมวดหมู่</option>
            {[...categories.income, ...categories.expense].map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* Transaction History List */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
            <h3 className="font-semibold text-gray-700">ประวัติรายการ</h3>
            <span className="text-xs text-gray-500">
              {filteredRecords.length} รายการ
            </span>
          </div>

          <div className="divide-y divide-gray-100 max-h-[50vh] overflow-y-auto">
            {filteredRecords.length === 0 ? (
              <p className="text-center py-6 text-gray-400 text-sm">
                ไม่พบรายการบัญชี
              </p>
            ) : (
              filteredRecords.map((record) => (
                <div
                  key={record.id}
                  className="p-4 hover:bg-gray-50 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-full ${
                        record.type === 'income'
                          ? 'bg-green-100 text-green-600'
                          : 'bg-red-100 text-red-600'
                      }`}
                    >
                      {record.type === 'income' ? (
                        <PlusCircle className="w-5 h-5" />
                      ) : (
                        <MinusCircle className="w-5 h-5" />
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800">
                        {record.category}
                      </p>
                      <p className="text-xs text-gray-500">
                        {record.date} {record.note ? `• ${record.note}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <span
                      className={`font-bold ${
                        record.type === 'income'
                          ? 'text-green-600'
                          : 'text-red-600'
                      }`}
                    >
                      {record.type === 'income' ? '+' : '-'}฿
                      {record.amount.toLocaleString()}
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(record)}
                        className="text-gray-400 hover:text-blue-500 p-1"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(record.id, record)}
                        className="text-gray-400 hover:text-red-500 p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
