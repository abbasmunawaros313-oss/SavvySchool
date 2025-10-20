// src/components/FeeVoucherManagement.jsx

import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  onSnapshot,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where
} from 'firebase/firestore';
import { db } from '../firebase';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { 
  FaFileInvoiceDollar, 
  FaSpinner, 
  FaEdit, 
  FaTrash, 
  FaDownload, 
  FaTimes,
  FaCheckCircle,
  FaExclamationCircle
} from 'react-icons/fa';
import jsPDF from 'jspdf';

// -----------------------------
// Constants
// -----------------------------
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 3 }, (_, i) => currentYear + i - 2); 
const getTodayDateString = () => {
  const today = new Date();
  return today.toISOString().split('T')[0];
};

const initialSlipState = {
  studentId: '',
  studentName: '',
  rollNumber: '',
  studentClass: '',
  month: MONTHS[new Date().getMonth()],
  year: currentYear,
  feeAmount: 0,
  fine: 0,
  lateFee: 0,
  dueDate: getTodayDateString(),
  paymentMode: 'Cash',
  bankName: '',
  accountNumber: '',
  status: 'Unpaid',
};


// =============================================
// == VOUCHER PREVIEW & DOWNLOAD COMPONENT ==
// =============================================
const VoucherPreview = ({ slip, onClose }) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const totalAmount = (slip.feeAmount || 0) + (slip.fine || 0) + (slip.lateFee || 0);

  const handleDownload = () => {
    setIsDownloading(true);
    try {
      const pdf = new jsPDF('p', 'mm', 'a4'); // Portrait, millimeters, A4
      const pageHeight = pdf.internal.pageSize.height;
      const pageWidth = pdf.internal.pageSize.width;
      const margin = 10;
      const slipHeight = (pageHeight / 2) - (margin * 1.5);
      const contentWidth = pageWidth - (margin * 2);

      const drawSlip = (startY, copyType) => {
        let y = startY + 5;
        pdf.setDrawColor(150);
        pdf.rect(margin, startY, contentWidth, slipHeight);
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'italic');
        pdf.text(copyType, pageWidth - margin - 5, y + 2, { align: 'right' });
        pdf.setFontSize(20);
        pdf.setFont('helvetica', 'bold');
        pdf.text("The Savvy School", margin + 25, y + 10);
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        pdf.text("Quaid-e-Azam Campus", margin + 25, y + 15);
         pdf.setFont('helvetica', 'bold');
        pdf.text("For Online Payment : EasyPaisa : 03XXXXXXXX", margin + 50, y +21);
        pdf.setFillColor(230, 230, 230);
        pdf.rect(margin + 5, y + 3, 15, 15, 'F');
        
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.text("FEE VOUCHER", pageWidth - margin - 5, y + 10, { align: 'right' });
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'normal');
        const statusColor = slip.status === 'Paid' ? [0, 150, 0] : [200, 0, 0];
        pdf.setTextColor(...statusColor);
      
        pdf.setTextColor(0);
        y += 22;
        pdf.setDrawColor(180);
        pdf.line(margin, y, pageWidth - margin, y);
        y += 8;
        pdf.setFontSize(9);
        const col1X = margin + 5;
        const col2X = margin + contentWidth / 2 + 5;
        pdf.text("Student Name:", col1X, y);
        pdf.setFont('helvetica', 'bold');
        pdf.text(slip.studentName, col1X, y + 4);
        pdf.setFont('helvetica', 'normal');
        pdf.text("Class:", col2X, y);
        pdf.setFont('helvetica', 'bold');
        pdf.text(slip.studentClass, col2X, y + 4);
        y += 8;
        pdf.setFont('helvetica', 'normal');
        pdf.text("Roll Number:", col1X, y);
        pdf.setFont('helvetica', 'bold');
        pdf.text(slip.rollNumber, col1X, y + 4);
        pdf.setFont('helvetica', 'normal');
        pdf.text("Fee Month:", col2X, y);
        pdf.setFont('helvetica', 'bold');
        pdf.text(`${slip.month}, ${slip.year}`, col2X, y + 4);
        y += 10;
        pdf.setDrawColor(180);
        pdf.line(margin, y, pageWidth - margin, y);
        y += 5;
        pdf.setFont('helvetica', 'bold');
        pdf.text("Description", col1X, y);
        pdf.text("Amount (Rs.)", pageWidth - margin - 5, y, { align: 'right' });
        y += 2;
        pdf.line(margin, y, pageWidth - margin, y);
        y += 5;
        pdf.setFont('helvetica', 'normal');
        pdf.text(`Fee for ${slip.month}`, col1X, y);
        pdf.text(slip.feeAmount.toLocaleString(), pageWidth - margin - 5, y, { align: 'right' });
        y += 6;
        pdf.text("Fines", col1X, y);
        pdf.text(slip.fine.toLocaleString(), pageWidth - margin - 5, y, { align: 'right' });
        y += 6;
        pdf.text("Late Fee 300 Per Day after Due Date", col1X, y);
        pdf.text(slip.lateFee.toLocaleString(), pageWidth - margin - 5, y, { align: 'right' });
        y += 2;
        pdf.setLineDashPattern([1, 1], 0);
        pdf.line(margin, y, pageWidth - margin, y);
        pdf.setLineDashPattern([], 0);
        y += 6;
        pdf.setFontSize(11);
        pdf.setFont('helvetica', 'bold');
        pdf.text("Total Amount", col1X, y);
        pdf.text(`Rs. ${totalAmount.toLocaleString()}`, pageWidth - margin - 5, y, { align: 'right' });
        y += 2;
        pdf.setDrawColor(0);
        pdf.setLineWidth(0.5);
        pdf.line(margin, y, pageWidth - margin, y);
        pdf.setLineWidth(0.2);
        y += 8;
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'normal');
        pdf.text("Mode of Payment:", col1X, y);
        pdf.setFont('helvetica', 'bold');
        pdf.text(slip.paymentMode, col1X + 35, y);
        pdf.setFont('helvetica', 'normal');
        if (slip.paymentMode === 'Online') { y += 5; pdf.setFillColor(245, 245, 245); pdf.rect(col1X - 2, y - 2, contentWidth - 6, 10, 'F'); pdf.setFontSize(8); pdf.text(`Pay To: ${slip.bankName || 'N/A'} - ${slip.accountNumber || 'N/A'}`, col1X, y + 2); y += 10; pdf.setFontSize(9); } else { y += 5; }
        const issueDate = slip.issueDate?.toDate ? slip.issueDate.toDate().toLocaleDateString() : getTodayDateString();
        pdf.text("Issue Date:", col1X, y + 5);
        pdf.setFont('helvetica', 'bold');
        pdf.text(issueDate, col1X + 25, y + 5);
        pdf.setFont('helvetica', 'normal');
        pdf.text("Due Date:", col2X, y + 5);
        pdf.setFont('helvetica', 'bold');
        pdf.text(slip.dueDate || 'N/A', col2X + 20, y + 5);
        const signatureY = startY + slipHeight - 15;
        pdf.setDrawColor(180);
        pdf.line(pageWidth - margin - 60, signatureY, pageWidth - margin - 5, signatureY);
        pdf.setFontSize(8);
        pdf.text("Principal / Admin Signature", pageWidth - margin - 5, signatureY + 3, { align: 'right' });
      };

      drawSlip(margin, "Student Copy");
      pdf.setDrawColor(100);
      pdf.setLineDashPattern([2, 2], 0);
      pdf.line(margin / 2, pageHeight / 2, pageWidth - margin / 2, pageHeight / 2);
      pdf.setLineDashPattern([], 0);
      drawSlip(pageHeight / 2 + (margin / 2), "School Copy");
      pdf.save(`FeeSlip_${slip.studentName}_${slip.month}_${slip.year}.pdf`);
      toast.success("Slip ready for download!");
    } catch (err) {
      console.error("PDF generation error:", err);
      toast.error("Failed to generate PDF.");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <header className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">Voucher Preview</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200"><FaTimes className="w-5 h-5 text-gray-600" /></button>
        </header>
        <div className="border border-gray-300 p-4 min-h-[200px] flex flex-col justify-center items-center text-center">
          <FaFileInvoiceDollar className="w-16 h-16 text-indigo-300 mb-4"/>
          <p className="text-lg font-semibold">{slip.studentName} - {slip.month}, {slip.year}</p>
          <p className="text-gray-600">Total: Rs. {totalAmount.toLocaleString()}</p>
          <p className="mt-4 text-sm text-gray-500">Click "Download PDF" to generate the full voucher with Student and School copies.</p>
        </div>
        <footer className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-5 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition">Close</button>
          <button type="button" onClick={handleDownload} disabled={isDownloading} className="px-5 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition flex items-center gap-2 disabled:bg-blue-400">
            {isDownloading ? <FaSpinner className="animate-spin" /> : <FaDownload />}
            {isDownloading ? "Downloading..." : "Download PDF"}
          </button>
        </footer>
      </div>
    </div>
  );
};

// =============================================
// == MAIN SLIP MANAGEMENT DASHBOARD ==
// =============================================
const FeeVoucherManagement = () => {
  const [students, setStudents] = useState([]);
  const [generatedSlips, setGeneratedSlips] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [loadingSlips, setLoadingSlips] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(MONTHS[new Date().getMonth()]);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [slipToEdit, setSlipToEdit] = useState(null);
  const [slipToPreview, setSlipToPreview] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    setLoadingStudents(true);
    const unsub = onSnapshot(collection(db, 'students_details'), snapshot => {
      const arr = snapshot.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name));
      setStudents(arr);
      setLoadingStudents(false);
    }, () => { toast.error('Failed to fetch students.'); setLoadingStudents(false); });
    return () => unsub();
  }, []);

  useEffect(() => {
    setLoadingSlips(true);
    const q = query(collection(db, 'fee_slips'), where('month', '==', selectedMonth), where('year', '==', selectedYear));
    const unsub = onSnapshot(q, snapshot => {
      const arr = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setGeneratedSlips(arr);
      setLoadingSlips(false);
    }, () => { toast.error(`Failed to fetch slips for ${selectedMonth}, ${selectedYear}.`); setLoadingSlips(false); });
    return () => unsub();
  }, [selectedMonth, selectedYear]);

  const studentsWithSlipStatus = useMemo(() => {
    const slipMap = new Map(generatedSlips.map(slip => [slip.studentId, slip]));
    return students.map(student => ({
      ...student,
      hasSlip: slipMap.has(student.id),
      slip: slipMap.get(student.id) || null
    }));
  }, [students, generatedSlips]);

  const monthlyStats = useMemo(() => {
    const totalGenerated = generatedSlips.length;
    let totalCollected = 0;
    let totalPending = 0;
    generatedSlips.forEach(slip => {
        if(slip.status === 'Paid') {
            totalCollected += slip.totalAmount || 0;
        } else {
            totalPending += slip.totalAmount || 0;
        }
    });
    return { totalGenerated, totalCollected, totalPending };
  }, [generatedSlips]);

  const openGenerateModal = (student) => {
    setSlipToEdit({ ...initialSlipState, studentId: student.id, studentName: student.name, rollNumber: student.rollNumber, studentClass: student.studentClass, month: selectedMonth, year: selectedYear });
    setIsModalOpen(true);
  };

  const openEditModal = (slip) => {
    setSlipToEdit({ ...slip, dueDate: slip.dueDate || getTodayDateString() });
    setIsModalOpen(true);
  };

  const closeModal = () => { setIsModalOpen(false); setSlipToEdit(null); };

  const handleFormChange = (e) => {
    const { name, value, type } = e.target;
    setSlipToEdit(prev => ({ ...prev, [name]: type === 'number' ? Number(value) : value }));
  };

  const handleSaveSlip = async (e) => {
    e.preventDefault();
    if (!slipToEdit) return;
    const totalAmount = (slipToEdit.feeAmount || 0) + (slipToEdit.fine || 0) + (slipToEdit.lateFee || 0);
    if (totalAmount <= 0) { toast.warn("Total amount must be greater than zero."); return; }
    setIsSaving(true);
    try {
      const slipData = { ...slipToEdit, totalAmount, year: slipToEdit.year || selectedYear };
      if (slipData.id) {
        const { id, ...dataToUpdate } = slipData;
        delete dataToUpdate.issueDate; // Don't update issue date
        await updateDoc(doc(db, 'fee_slips', id), dataToUpdate);
        toast.success("Slip updated!");
      } else {
        const dataToCreate = { ...slipData, issueDate: new Date(), status: 'Unpaid' };
        await addDoc(collection(db, 'fee_slips'), dataToCreate);
        toast.success("Slip generated!");
      }
      closeModal();
    } catch (err) {
      toast.error("Failed to save slip.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSlip = async (slipId) => {
    if (!window.confirm("Are you sure? This cannot be undone.")) return;
    setIsDeleting(slipId);
    try {
      await deleteDoc(doc(db, 'fee_slips', slipId));
      toast.success("Slip deleted.");
    } catch (err) {
      toast.error("Failed to delete slip.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="p-4 md:p-8 bg-gray-50 min-h-screen font-sans">
      <ToastContainer position="top-right" autoClose={3000} hideProgressBar={false} />
      <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
    <h1 className="text-3xl md:text-4xl font-bold text-gray-800 items-center mb-6">Fee Slip Management</h1>
      <h4 className="">Your are on Trail Version For this Section</h4>
      <h4 className="">Ends on 23/oct/2025</h4>

    </div>      
      {/* --- Stat Boxes --- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl shadow-lg flex items-center gap-4">
            <FaFileInvoiceDollar className="w-12 h-12 text-indigo-500"/>
            <div>
                <p className="text-sm text-gray-500">Vouchers Generated</p>
                <p className="text-2xl font-bold text-gray-800">{loadingSlips ? '...' : monthlyStats.totalGenerated}</p>
            </div>
      
        </div>
      </div>

      <div className="mb-6 flex gap-4 max-w-md">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">Select Year</label>
          <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-400">
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">Select Month</label>
          <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-400">
            {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-2xl shadow-xl">
          <h2 className="text-2xl font-semibold text-gray-700 mb-4">Student List ({selectedMonth}, {selectedYear})</h2>
          <div className="max-h-[600px] overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0 z-10"><tr><th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Generated</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Class</th><th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th></tr></thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loadingStudents || loadingSlips ? (<tr><td colSpan="4" className="text-center py-12 text-gray-500">Loading data...</td></tr>) : (studentsWithSlipStatus.map(student => (<tr key={student.id} className={student.hasSlip ? 'bg-green-50' : 'hover:bg-gray-50'}><td className="px-4 py-4 text-center"><input type="checkbox" checked={student.hasSlip} readOnly disabled className="rounded text-indigo-600" /></td><td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{student.name}</td><td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{student.studentClass}</td><td className="px-6 py-4 whitespace-nowrap text-sm text-center">{student.hasSlip ? (<button onClick={() => openEditModal(student.slip)} className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-200 rounded-full hover:bg-gray-300">View/Edit</button>) : (<button onClick={() => openGenerateModal(student)} className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-full hover:bg-indigo-700">Generate</button>)}</td></tr>)))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-xl">
          <h2 className="text-2xl font-semibold text-gray-700 mb-4">Generated Slips ({selectedMonth}, {selectedYear})</h2>
          <div className="max-h-[600px] overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0 z-10"><tr><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student</th><th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total (Rs.)</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th><th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th></tr></thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loadingSlips ? (<tr><td colSpan="4" className="text-center py-12 text-gray-500">Loading slips...</td></tr>) : generatedSlips.length === 0 ? (<tr><td colSpan="4" className="text-center py-12 text-gray-500">No slips generated for {selectedMonth}, {selectedYear}.</td></tr>) : (generatedSlips.map(slip => (<tr key={slip.id} className="hover:bg-gray-50"><td className="px-6 py-4 whitespace-nowrap"><div className="text-sm font-medium text-gray-900">{slip.studentName}</div><div className="text-xs text-gray-500">{slip.studentClass}</div></td><td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800 text-right font-semibold">Rs. {slip.totalAmount.toLocaleString()}</td><td className="px-6 py-4 whitespace-nowrap text-sm"><span className={`px-2.5 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${slip.status === 'Paid' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{slip.status}</span></td><td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium"><div className="flex justify-center items-center gap-2"><button onClick={() => setSlipToPreview(slip)} className="p-2 text-blue-600 hover:bg-blue-100 rounded-full transition-all" title="Download Slip"><FaDownload className="h-4 w-4" /></button><button onClick={() => openEditModal(slip)} className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-100 rounded-full transition-all" title="Edit Slip"><FaEdit className="h-4 w-4" /></button><button onClick={() => handleDeleteSlip(slip.id)} disabled={isDeleting === slip.id} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-100 rounded-full transition-all disabled:opacity-50" title="Delete Slip">{isDeleting === slip.id ? <FaSpinner className="animate-spin h-4 w-4" /> : <FaTrash className="h-4 w-4" />}</button></div></td></tr>)))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {isModalOpen && slipToEdit && (<div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4"><form onSubmit={handleSaveSlip} className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"><header className="flex items-center justify-between mb-6 pb-4 border-b"><h2 className="text-2xl font-bold">{slipToEdit.id ? 'Edit Slip' : 'Generate Slip'}</h2><button type="button" onClick={closeModal} className="p-2 rounded-full hover:bg-gray-200"><FaTimes className="w-5 h-5 text-gray-600" /></button></header><div className="space-y-4"><div className="grid grid-cols-4 gap-4"><div><label className="block text-sm font-medium text-gray-500">Student</label><input type="text" value={slipToEdit.studentName} readOnly disabled className="w-full px-4 py-2.5 bg-gray-100 border border-gray-300 rounded-lg" /></div><div><label className="block text-sm font-medium text-gray-500">Class</label><input type="text" value={slipToEdit.studentClass} readOnly disabled className="w-full px-4 py-2.5 bg-gray-100 border border-gray-300 rounded-lg" /></div><div><label className="block text-sm font-medium text-gray-500">Month</label><input type="text" value={slipToEdit.month} readOnly disabled className="w-full px-4 py-2.5 bg-gray-100 border border-gray-300 rounded-lg" /></div><div><label className="block text-sm font-medium text-gray-500">Year</label><input type="number" value={slipToEdit.year} readOnly disabled className="w-full px-4 py-2.5 bg-gray-100 border border-gray-300 rounded-lg" /></div></div><div className="grid grid-cols-3 gap-4"><div><label className="block text-sm font-medium text-gray-700 mb-1">Fee Amount (Rs.)</label><input type="number" name="feeAmount" value={slipToEdit.feeAmount} onChange={handleFormChange} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-400" required /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Fines (Rs.)</label><input type="number" name="fine" value={slipToEdit.fine} onChange={handleFormChange} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-400" /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Late Fee (Rs.)</label><input type="number" name="lateFee" value={slipToEdit.lateFee} onChange={handleFormChange} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-400" /></div></div><div className="grid grid-cols-2 gap-4"><div><label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label><input type="date" name="dueDate" value={slipToEdit.dueDate} onChange={handleFormChange} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-400" required /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Status</label><select name="status" value={slipToEdit.status} onChange={handleFormChange} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-400"><option value="Unpaid">Unpaid</option><option value="Paid">Paid</option></select></div></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Mode of Payment</label><select name="paymentMode" value={slipToEdit.paymentMode} onChange={handleFormChange} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-400"><option value="Cash">Cash</option><option value="Online">Online</option></select></div>{slipToEdit.paymentMode === 'Online' && (<div className="grid grid-cols-2 gap-4 p-4 border border-indigo-200 bg-indigo-50 rounded-lg"><div><label className="block text-sm font-medium text-gray-700 mb-1">Bank/App Name</label><input type="text" name="bankName" placeholder="e.g., Easypaisa" value={slipToEdit.bankName} onChange={handleFormChange} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-400" /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Account Number</label><input type="text" name="accountNumber" placeholder="e.g., 03000000000" value={slipToEdit.accountNumber} onChange={handleFormChange} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-400" /></div></div>)}</div><footer className="mt-8 pt-6 border-t flex justify-end gap-3"><button type="button" onClick={closeModal} className="px-6 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition">Cancel</button><button type="submit" disabled={isSaving} className="px-6 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition flex items-center gap-2 disabled:bg-green-400">{isSaving ? <FaSpinner className="animate-spin" /> : <FaFileInvoiceDollar />}{isSaving ? 'Saving...' : 'Save Slip'}</button></footer></form></div>)}
      {slipToPreview && (<VoucherPreview slip={slipToPreview} onClose={() => setSlipToPreview(null)} />)}
    </div>
  );
};

export default FeeVoucherManagement;
