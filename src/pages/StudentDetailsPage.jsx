import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  onSnapshot,
  addDoc,
  doc,
  updateDoc,
  query,
  where,
  getDocs,
  deleteDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import { HiUserGroup, HiOutlinePencilAlt, HiOutlineTrash } from 'react-icons/hi';
import { FaUserPlus, FaFilePdf, FaMoneyBillWave } from 'react-icons/fa';
import { IoSparkles } from 'react-icons/io5';
import { AiFillCloseCircle, AiOutlineExclamationCircle } from 'react-icons/ai';
import { BsCheckLg, BsXLg } from 'react-icons/bs';

import jsPDF from 'jspdf';

// -----------------------------
// Constants
// -----------------------------
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

// Added fine: 0 to each month
const createInitialFees = () => {
  const f = {};
  MONTHS.forEach(m => f[m] = { amount: 0, paid: false, remarks: '', fine: 0 }); 
  f['Additional'] = { amount: 0, paid: false, description: '', remarks: '', fine: 0 };
  return f;
};

// CHANGE: Added more gradients for the class cards
const CLASS_GRADIENTS = [
  'bg-gradient-to-br from-purple-500 to-purple-600',
  'bg-gradient-to-br from-pink-500 to-pink-600',
  'bg-gradient-to-br from-teal-500 to-teal-600',
  'bg-gradient-to-br from-rose-500 to-rose-600',
  'bg-gradient-to-br from-cyan-500 to-cyan-600',
  'bg-gradient-to-br from-lime-500 to-lime-600',
  'bg-gradient-to-br from-fuchsia-500 to-fuchsia-600',
  'bg-gradient-to-br from-indigo-500 to-indigo-600',
];

// CHANGE: Added items per page for pagination
const ITEMS_PER_PAGE = 10;

// -----------------------------
// Small UI bits
// -----------------------------
const StatCard = ({ title, value, icon, color, onClick, isActive }) => (
  <div
    onClick={onClick}
    className={`relative p-6 rounded-2xl shadow-lg overflow-hidden transition-all duration-300 ease-in-out transform hover:-translate-y-1 hover:shadow-2xl ${color} ${onClick ? 'cursor-pointer' : ''} ${isActive ? 'ring-4 ring-white ring-opacity-70' : ''}`}
  >
    <div className="relative z-10">
      <h3 className="text-lg font-semibold text-white text-opacity-90 truncate">{title}</h3>
      <p className="text-3xl md:text-4xl font-bold mt-2 text-white">{value}</p>
    </div>
    <div className="absolute -bottom-4 -right-4 opacity-20 text-white">
      {React.cloneElement(icon, { className: "w-24 h-24" })}
    </div>
  </div>
);

// -----------------------------
// Main Component
// -----------------------------
const StudentDetailsPage = () => {
  // data
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  // UI / filters
  const [searchTerm, setSearchTerm] = useState('');
  const [classFilter, setClassFilter] = useState(null);
  const [feeFilter, setFeeFilter] = useState({ month: 'all', status: 'all' });

  // CRUD / Modals
  const [studentToEdit, setStudentToEdit] = useState(null);
  const [isAddOrEditModalOpen, setAddOrEditModalOpen] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fee modal
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [feeDetails, setFeeDetails] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  // selection / export
  const [selectedStudents, setSelectedStudents] = useState(new Set());
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // CHANGE: Added state for pagination
  const [currentPage, setCurrentPage] = useState(1);

  // -----------------------------
  // Firestore: real-time fetch
  // -----------------------------
  useEffect(() => {
    setLoading(true);
    const unsub = onSnapshot(collection(db, 'students_details'), snapshot => {
      const arr = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setStudents(arr);
      setLoading(false);
    }, err => {
      console.error('fetch error', err);
      toast.error('Failed to fetch students.');
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // -----------------------------
  // Derived data: fee summaries
  // -----------------------------
  const studentsWithFeeSummary = useMemo(() => {
    return students.map(s => {
      const fees = s.fees || createInitialFees();
      const { totalDue, totalPaid, balance } = feeSummaryCalc(fees);
      return { ...s, fees, totalDue, totalPaid, balance };
    });
  }, [students]);

  // -----------------------------
  // Filtering / searching
  // -----------------------------
  const filteredStudents = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return studentsWithFeeSummary
      .filter(s => !classFilter || s.studentClass === classFilter)
      .filter(s => {
        if (feeFilter.month === 'all') return true;
        const fr = s.fees?.[feeFilter.month];
        const totalMonthlyDue = (Number(fr?.amount) || 0) + (Number(fr?.fine) || 0);
        if (!fr || totalMonthlyDue <= 0) {
          return feeFilter.status === 'unpaid' ? true : false;
        }
        if (feeFilter.status === 'all') return true;
        if (feeFilter.status === 'paid') return !!fr.paid;
        if (feeFilter.status === 'unpaid') return !fr.paid;
        return true;
      })
      .filter(s => {
        if (!term) return true;
        return (
          s.name?.toLowerCase().includes(term) ||
          s.studentClass?.toLowerCase().includes(term) ||
          String(s.rollNumber).includes(term)
        );
      });
  }, [studentsWithFeeSummary, classFilter, feeFilter, searchTerm]);

  // -----------------------------
  // Stats: global and filtered
  // -----------------------------
  const globalStats = useMemo(() => {
    const totalStudents = students.length;
    const studentsByClass = students.reduce((acc, s) => {
      const name = s.studentClass?.trim() || 'Unassigned';
      acc[name] = (acc[name] || 0) + 1;
      return acc;
    }, {});
    const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const newStudentsCount = students.filter(s => s.admissionDate?.toDate ? s.admissionDate.toDate() > thirtyDaysAgo : false).length;
    return { totalStudents, studentsByClass, newStudentsCount };
  }, [students]);

  const filteredStats = useMemo(() => {
    const totalFeesCollected = filteredStudents.reduce((sum, s) => sum + (s.totalPaid || 0), 0);
    const totalOutstandingBalance = filteredStudents.reduce((sum, s) => sum + (s.balance || 0), 0);
    return { totalFeesCollected, totalOutstandingBalance };
  }, [filteredStudents]);
  
  // -----------------------------
  // CHANGE: Pagination Logic
  // -----------------------------
  const totalPages = Math.ceil(filteredStudents.length / ITEMS_PER_PAGE);

  const paginatedStudents = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    return filteredStudents.slice(start, end);
  }, [filteredStudents, currentPage]);

  // CHANGE: Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, classFilter, feeFilter]);


  // -----------------------------
  // Handlers: filters & selections
  // -----------------------------
  const handleFilterChange = (name, value) => {
    // ... (rest of the function is unchanged)
    if (name === 'feeMonth') {
      setFeeFilter(prev => ({ month: value, status: prev.status }));
    } else if (name === 'feeStatus') {
      setFeeFilter(prev => ({ ...prev, status: value }));
    } else if (name === 'classFilter') {
      setClassFilter(value);
    } else if (name === 'searchTerm') {
      setSearchTerm(value);
    }
  };

  const clearAllFilters = () => {
    setSearchTerm('');
    setClassFilter(null);
    setFeeFilter({ month: 'all', status: 'all' });
    setSelectedStudents(new Set());
    // setCurrentPage(1); // No need, useEffect above handles this
  };

  const handleSelectStudent = (id, checked) => {
    setSelectedStudents(prev => {
      const copy = new Set(prev);
      if (checked) copy.add(id);
      else copy.delete(id);
      return copy;
    });
  };

  // This function still selects ALL filtered students, not just the current page
  const handleSelectAll = (checked) => {
    if (checked) setSelectedStudents(new Set(filteredStudents.map(s => s.id)));
    else setSelectedStudents(new Set());
  };

  // -----------------------------
  // Add / Edit / Delete Student
  // -----------------------------
  // ... (no changes needed in add/edit/delete logic) ...
  const openAddModal = () => {
    setStudentToEdit({ name: '', studentClass: '', rollNumber: '' });
    setAddOrEditModalOpen(true);
  };
  const openEditModal = (student) => {
    setStudentToEdit({ ...student });
    setAddOrEditModalOpen(true);
  };
  const handleAddOrEditStudent = async (e) => {
    e.preventDefault();
    if (!studentToEdit) return;
    const { name, studentClass, rollNumber } = studentToEdit;
    if (!name || !studentClass || !rollNumber) {
      toast.warn('Please fill all fields.');
      return;
    }
    setIsSaving(true);
    try {
      if (studentToEdit.id) {
        await updateDoc(doc(db, 'students_details', studentToEdit.id), { name, studentClass, rollNumber });
        toast.success('Student updated.');
      } else {
        const q = query(collection(db, 'students_details'), where('name', '==', name), where('studentClass', '==', studentClass), where('rollNumber', '==', rollNumber));
        const snap = await getDocs(q);
        if (!snap.empty) {
          toast.error('Student with same details exists.');
          setIsSaving(false);
          return;
        }
        await addDoc(collection(db, 'students_details'), { name, studentClass, rollNumber, admissionDate: new Date(), fees: createInitialFees() });
        toast.success('Student added.');
      }
      setAddOrEditModalOpen(false);
      setStudentToEdit(null);
    } catch (err) {
      console.error(err);
      toast.error('Failed to save student.');
    } finally {
      setIsSaving(false);
    }
  };
  const confirmDelete = (student) => setStudentToDelete(student);
  const handleDeleteStudent = async () => {
    if (!studentToDelete) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'students_details', studentToDelete.id));
      toast.success('Deleted.');
      setStudentToDelete(null);
    } catch (err) {
      console.error(err);
      toast.error('Delete failed.');
    } finally {
      setIsDeleting(false);
    }
  };

  // -----------------------------
  // Fee modal open / edit / save
  // -----------------------------
  // ... (no changes needed in fee modal logic) ...
  const handleOpenFeeModal = (student) => {
    setSelectedStudent(student);
    const cloned = JSON.parse(JSON.stringify(student.fees || createInitialFees()));
    setFeeDetails(cloned);
  };
  const handleFeeChange = (month, field, value) => {
    setFeeDetails(prev => ({ ...prev, [month]: { ...prev[month], [field]: value } }));
  };
  const handleTogglePaid = (month) => {
    setFeeDetails(prev => ({ ...prev, [month]: { ...prev[month], paid: !prev[month]?.paid } }));
  };
  const handleSaveFeeDetails = async () => {
    if (!selectedStudent) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'students_details', selectedStudent.id), { fees: feeDetails });
      toast.success('Fees updated.');
      setSelectedStudent(null);
    } catch (err) {
      console.error(err);
      toast.error('Failed to update fees.');
    } finally {
      setIsSaving(false);
    }
  };

  // -----------------------------
  // PDF Generation with Monthly Details
  // -----------------------------
  // ... (no changes needed in PDF generation logic) ...
  const generateStudentListReport = (studentsToExport, title, classFilter, feeFilter) => {
    if (!studentsToExport || studentsToExport.length === 0) {
      toast.warn('No students to export.');
      return;
    }
    
    setIsGeneratingPdf(true);
    
    setTimeout(() => {
        try {
            const doc = new jsPDF();
            let y = 18;
            const margin = 14;
            const pageHeight = doc.internal.pageSize.height;
            const pageWidth = doc.internal.pageSize.width;

            // PDF header
            doc.setFontSize(22); doc.setFont('helvetica', 'bold');
            doc.text("Savvy School", pageWidth / 2, y, { align: 'center' });
            y += 8;
            doc.setFontSize(14); doc.setFont('helvetica', 'normal');
            doc.text("Quaid-e-Azam Campus", pageWidth / 2, y, { align: 'center' });
            y += 8;
            doc.setFontSize(16); doc.setFont('helvetica', 'bold');
            doc.text("Official Student Fee Report", pageWidth / 2, y, { align: 'center' });
            y += 10;
            doc.setFontSize(10); doc.setFont('helvetica', 'normal');
            doc.text(`Report Title: ${title}`, margin, y);
            y += 6;
            doc.text(`Class Filter: ${classFilter || 'All Classes'}`, margin, y);
            y += 6;
            doc.text(`Fee Filter: ${feeFilter.month} - ${feeFilter.status}`, margin, y);
            y += 8;

            studentsToExport.forEach((student, index) => {
                if (y > pageHeight - 60) {
                    doc.addPage();
                    y = margin;
                }

                if (index > 0) {
                    doc.setLineDashPattern([1, 1], 0);
                    doc.line(margin, y, pageWidth - margin, y);
                    doc.setLineDashPattern([], 0);
                    y += 8;
                }
                
                doc.setFontSize(12); doc.setFont('helvetica', 'bold');
                doc.text(`${student.name} (Roll No: ${student.rollNumber})`, margin, y);
                doc.setFontSize(10); doc.setFont('helvetica', 'normal');
                doc.text(`Class: ${student.studentClass}`, pageWidth - margin, y, { align: 'right' });
                y += 8;

                // PDF table header (with Fine)
                doc.setFontSize(9); doc.setFont('helvetica', 'bold');
                doc.setFillColor(230, 230, 230);
                doc.rect(margin, y, pageWidth - 2 * margin, 7, 'F');
                doc.text("Month", margin + 2, y + 5);
                doc.text("Fee (Rs.)", margin + 50, y + 5);
                doc.text("Fine (Rs.)", margin + 90, y + 5);
                doc.text("Status", margin + 120, y + 5);
                doc.text("Remarks", margin + 150, y + 5);
                y += 7;

                MONTHS.forEach(month => {
                    if (y > pageHeight - 20) {
                        doc.addPage(); y = margin;
                        doc.setFontSize(9); doc.setFont('helvetica', 'bold');
                        doc.text(`(Continuation for ${student.name})`, margin, y);
                        y += 8;
                        doc.setFillColor(230, 230, 230);
                        doc.rect(margin, y, pageWidth - 2 * margin, 7, 'F');
                        doc.text("Month", margin + 2, y + 5);
                        doc.text("Fee (Rs.)", margin + 50, y + 5);
                        doc.text("Fine (Rs.)", margin + 90, y + 5);
                        doc.text("Status", margin + 120, y + 5);
                        doc.text("Remarks", margin + 150, y + 5);
                        y += 7;
                    }
                    
                    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
                    const fee = student.fees[month] || { amount: 0, paid: false, remarks: '', fine: 0 };
                    const amount = Number(fee.amount || 0);
                    const fine = Number(fee.fine || 0);
                    const totalMonthly = amount + fine;
                    const status = totalMonthly > 0 ? (fee.paid ? 'Paid' : 'Unpaid') : 'N/A';
                    const remarks = fee.remarks || '';

                    doc.text(month, margin + 2, y + 5);
                    doc.text(amount.toLocaleString(), margin + 80, y + 5, { align: 'right' }); 
                    doc.text(fine > 0 ? fine.toLocaleString() : '-', margin + 110, y + 5, { align: 'right' });

                    if (status === 'Paid') doc.setTextColor(34, 139, 34);
                    else if (status === 'Unpaid') doc.setTextColor(220, 20, 60);
                    else doc.setTextColor(128, 128, 128);

                    doc.text(status, margin + 120, y + 5);
                    doc.setTextColor(0, 0, 0);

                    doc.text(remarks, margin + 150, y + 5);
                    y += 7;
                });
                
                y += 2;
                doc.setLineWidth(0.2);
                doc.line(margin, y, pageWidth - margin, y);
                y += 6;
                doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
                doc.text(`Total Due: Rs. ${student.totalDue.toLocaleString()}`, margin, y);
                doc.text(`Total Paid: Rs. ${student.totalPaid.toLocaleString()}`, margin + 65, y);
                doc.text(`Balance: Rs. ${student.balance.toLocaleString()}`, margin + 130, y);
                y += 10;
            });

            doc.save('Savvy_School_Fee_Report.pdf');
            toast.success("Report generated!");
        } catch (error) {
            toast.error("Failed to generate PDF report.");
            console.error("PDF generation failed:", error);
        } finally {
            setIsGeneratingPdf(false);
    _   }
    }, 100);
  };

  const handleExportFiltered = () => {
    generateStudentListReport(filteredStudents, "Filtered Student List", classFilter, feeFilter);
  };

  const handleExportSelected = () => {
    const studentsToExport = studentsWithFeeSummary.filter(s => selectedStudents.has(s.id));
    generateStudentListReport(studentsToExport, "Selected Students List", "N/A", { month: 'N/A', status: 'N/A' });
  };


  // -----------------------------
  // Render
  // -----------------------------
  return (
    <div className="p-4 md:p-8 bg-gray-50 min-h-screen font-sans">
      <ToastContainer position="top-right" autoClose={3000} hideProgressBar={false} />

      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
      {/* ... (header is unchanged) ... */}
        <h1 className="text-3xl md:text-4xl font-bold text-gray-800 items-center">Student Management</h1>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <button 
            onClick={handleExportFiltered} 
            disabled={isGeneratingPdf}
            className="flex items-center gap-2 bg-white rounded-lg shadow px-4 py-2 text-sm md:text-base text-gray-700 hover:text-gray-900 transition disabled:cursor-wait disabled:bg-gray-200"
          >
            <FaFilePdf className="text-red-600" />
            {isGeneratingPdf ? 'Generating...' : 'Export Filtered Report'}
          </button>
        </div>
      </header>
      
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-6 mb-8">
        <StatCard title="All Students" value={globalStats.totalStudents} icon={<HiUserGroup />} color="bg-gradient-to-br from-blue-500 to-blue-600" onClick={() => handleFilterChange('classFilter', null)} isActive={!classFilter} />
        <StatCard title="Fees Collected" value={`Rs. ${filteredStats.totalFeesCollected.toLocaleString()}`} icon={<FaMoneyBillWave />} color="bg-gradient-to-br from-green-500 to-green-600" />
        <StatCard title="Pending" value={`Rs. ${filteredStats.totalOutstandingBalance.toLocaleString()}`} icon={<AiOutlineExclamationCircle />} color="bg-gradient-to-br from-red-500 to-red-600" />
        <StatCard title="New Students (30d)" value={globalStats.newStudentsCount} icon={<IoSparkles />} color="bg-gradient-to-br from-yellow-500 to-yellow-600" />
        
        {/* CHANGE: Added index and dynamic colors to class stat cards */}
        {Object.entries(globalStats.studentsByClass)
          .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
          .map(([className, count], index) => (
            <StatCard 
              key={className} 
              title={className} 
              value={count} 
              icon={<HiUserGroup />} 
              color={CLASS_GRADIENTS[index % CLASS_GRADIENTS.length]} // Apply gradients cyclically
              onClick={() => handleFilterChange('classFilter', className)} 
              isActive={classFilter === className} 
            />
        ))}
      </section>

      <section className="mb-6 p-4 bg-white rounded-xl shadow-md">
      {/* ... (filter section is unchanged) ... */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 items-end">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Search Student</label>
            <input type="text" placeholder="Name, class, or roll no..." className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" value={searchTerm} onChange={(e) => handleFilterChange('searchTerm', e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Filter by Month</label>
            <select value={feeFilter.month} onChange={(e) => handleFilterChange('feeMonth', e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400">
              <option value="all">All Months</option>
              {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fee Status</label>
            <select value={feeFilter.status} onChange={(e) => handleFilterChange('feeStatus', e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" disabled={feeFilter.month === 'all'}>
              <option value="all">Any Status</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Unpaid</option>
            </select>
          </div>
          <div className="flex gap-2 w-full">
            <button onClick={openAddModal} className="flex-1 flex items-center justify-center px-4 py-2.5 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 transition transform hover:scale-105">
              <FaUserPlus className="h-5 w-5 mr-2" /> Add
            </button>
          </div>
        </div>
      </section>

      {(classFilter || feeFilter.month !== 'all' || selectedStudents.size > 0) && (
        <div className="mb-4 flex items-center gap-4 flex-wrap">
        {/* ... (active filters section is unchanged) ... */}
          <h3 className="text-lg font-semibold text-gray-700">Active:</h3>
          {classFilter && <span className="text-indigo-600 bg-indigo-100 px-3 py-1 rounded-full text-sm">{classFilter}</span>}
          {feeFilter.month !== 'all' && <span className="text-purple-600 bg-purple-100 px-3 py-1 rounded-full text-sm">{feeFilter.month} Fees: {feeFilter.status}</span>}
          {selectedStudents.size > 0 && <span className="text-blue-600 bg-blue-100 px-3 py-1 rounded-full text-sm">{selectedStudents.size} selected</span>}
          <button onClick={clearAllFilters} className="flex items-center text-sm px-3 py-1 bg-red-100 text-red-700 font-semibold rounded-full hover:bg-red-200 transition">
            <AiFillCloseCircle className="h-5 w-5 mr-1" /> Clear All
          </button>
          {selectedStudents.size > 0 && (
            <button 
                onClick={handleExportSelected} 
                disabled={isGeneratingPdf}
                className="flex items-center text-sm px-3 py-1 bg-gray-600 text-white font-semibold rounded-full hover:bg-gray-700 transition disabled:cursor-wait disabled:bg-gray-400"
            >
              <FaFilePdf className="h-4 w-4 mr-2" /> 
              {isGeneratingPdf ? 'Generating...' : 'Export Selected'}
            </button>
          )}
        </div>
      )}

      <main className="bg-white shadow-xl rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100">
              <tr>
                {/* Checkbox logic uses filteredStudents.length, which is correct */}
                <th className="px-4 py-4"><input type="checkbox" onChange={(e) => handleSelectAll(e.target.checked)} checked={filteredStudents.length > 0 && selectedStudents.size === filteredStudents.length} className="rounded" /></th>
                {["Name","Class","Roll No.","Total Due","Total Paid","Balance","Actions"].map((h,i) => (
                  <th key={i} className={`px-6 py-4 text-xs font-bold text-gray-600 uppercase tracking-wider ${i < 3 ? 'text-left' : i === 6 ? 'text-center' : 'text-right'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan="8" className="text-center py-12 text-gray-500">Loading students...</td></tr>
              ) : filteredStudents.length > 0 ? (
                // CHANGE: Map over paginatedStudents instead of filteredStudents
                paginatedStudents.map(s => (
                  <tr key={s.id} className={`hover:bg-indigo-50 transition-colors group ${selectedStudents.has(s.id) ? 'bg-indigo-100' : ''}`}>
                    <td className="px-4 py-4"><input type="checkbox" checked={selectedStudents.has(s.id)} onChange={(e) => handleSelectStudent(s.id, e.target.checked)} className="rounded" /></td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{s.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{s.studentClass}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{s.rollNumber}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-right">Rs. {s.totalDue.toLocaleString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 text-right">Rs. {s.totalPaid.toLocaleString()}</td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-semibold text-right ${s.balance > 0 ? 'text-red-600' : 'text-gray-800'}`}>Rs. {s.balance.toLocaleString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                      <div className="flex justify-center items-center gap-2">
                        <button onClick={() => handleOpenFeeModal(s)} className="px-3 py-2 bg-indigo-100 text-indigo-700 font-semibold rounded-full hover:bg-indigo-200 transition-all">Fees</button>
                        <button onClick={() => openEditModal(s)} className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-100 rounded-full transition-all"><HiOutlinePencilAlt className="h-5 w-5" /></button>
                        <button onClick={() => confirmDelete(s)} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-100 rounded-full transition-all"><HiOutlineTrash className="h-5 w-5" /></button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                // This "no students" message is still correct
                <tr><td colSpan="8" className="text-center py-12 text-gray-500">No students found matching your criteria.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ----------------------------- */}
        {/* CHANGE: Pagination Controls */}
        {/* ----------------------------- */}
        {totalPages > 1 && (
          <div className="flex justify-between items-center py-4 px-6 border-t border-gray-200">
            <div>
              <span className="text-sm text-gray-700">
                Page <span className="font-semibold">{currentPage}</span> of <span className="font-semibold">{totalPages}</span>
                <span className="hidden sm:inline"> | Total Matches: <span className="font-semibold">{filteredStudents.length}</span></span>
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage(p => p - 1)}
                disabled={currentPage === 1}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage(p => p + 1)}
                disabled={currentPage === totalPages}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </main>

      {/* ... (Add/Edit and Delete Modals remain the same) ... */}
      {isAddOrEditModalOpen && studentToEdit && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md">
            <h2 className="text-2xl font-bold mb-6 text-gray-800">{studentToEdit.id ? 'Edit Student Details' : 'Register New Student'}</h2>
            <form onSubmit={handleAddOrEditStudent}>
              <div className="space-y-4">
                <input type="text" placeholder="Full Name" value={studentToEdit.name} onChange={(e) => setStudentToEdit({...studentToEdit, name: e.target.value})} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" required />
                <input type="text" placeholder="Class (e.g., 'Class 10')" value={studentToEdit.studentClass} onChange={(e) => setStudentToEdit({...studentToEdit, studentClass: e.target.value})} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" required />
                <input type="text" placeholder="Roll Number" value={studentToEdit.rollNumber} onChange={(e) => setStudentToEdit({...studentToEdit, rollNumber: e.target.value})} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" required />
              </div>
              <div className="mt-8 flex justify-end gap-4">
                <button type="button" onClick={() => { setAddOrEditModalOpen(false); setStudentToEdit(null); }} className="px-6 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition">Cancel</button>
                <button type="submit" disabled={isSaving} className="px-6 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition disabled:bg-indigo-400">{isSaving ? 'Saving...' : (studentToEdit.id ? 'Save Changes' : 'Add Student')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {studentToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md">
            <h2 className="text-2xl font-bold mb-4 text-gray-800">Confirm Deletion</h2>
            <p className="text-gray-600 mb-6">Are you sure you want to delete <span className="font-semibold">{studentToDelete.name}</span>? This action cannot be undone.</p>
            <div className="flex justify-end gap-4">
              <button type="button" onClick={() => setStudentToDelete(null)} className="px-6 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition">Cancel</button>
              <button type="button" onClick={handleDeleteStudent} disabled={isDeleting} className="px-6 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition disabled:bg-red-400">{isDeleting ? 'Deleting...' : 'Confirm Delete'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ... (Fee Details Modal remains the same, with the 'Fine' input) ... */}
      {selectedStudent && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <header className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-2xl font-bold">Fee Details: {selectedStudent.name}</h2>
                <p className="text-gray-600">Class: {selectedStudent.studentClass} | Roll No: {selectedStudent.rollNumber}</p>
            _ </div>
              <button onClick={() => { setSelectedStudent(null); }} className="px-3 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">Close</button>
            </header>
            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {MONTHS.map(month => (
                <div key={month} className={`p-4 rounded-xl border-2 transition-all ${feeDetails[month]?.paid ? 'border-green-400 bg-green-50' : 'border-red-300 bg-red-50'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-700">{month}</h3>
                    <button onClick={() => handleTogglePaid(month)} className="transform hover:scale-110 transition-transform">
                      {feeDetails[month]?.paid ? <BsCheckLg className="w-6 h-6 text-green-500" /> : <BsXLg className="w-6 h-6 text-red-500" />}
                 </button>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-600 w-16">Fee:</span>
                      <input type="number" value={feeDetails[month]?.amount || ''} onChange={(e) => handleFeeChange(month, 'amount', Number(e.target.value))} className="w-full px-2 py-1 border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-600 w-16">Fine:</span>
                      <input type="number" value={feeDetails[month]?.fine || ''} onChange={(e) => handleFeeChange(month, 'fine', Number(e.target.value))} className="w-full px-2 py-1 border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500" />
                 </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-600 w-16">Remarks:</span>
                      <input type="text" placeholder="e.g., Cash" value={feeDetails[month]?.remarks || ''} onChange={(e) => handleFeeChange(month, 'remarks', e.target.value)} className="w-full px-2 py-1 border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500" />
                    </div>
                  </div>
                </div>
              ))}
              <div className={`p-4 rounded-xl border-2 col-span-1 md:col-span-2 lg:col-span-3 transition-all ${feeDetails['Additional']?.paid ? 'border-green-400 bg-green-50' : 'border-gray-300 bg-gray-50'}`}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-gray-700">Additional / Extras</h3>
                  <button onClick={() => handleTogglePaid('Additional')} className="transform hover:scale-110 transition-transform">
                   {feeDetails['Additional']?.paid ? <BsCheckLg className="w-6 h-6 text-green-500" /> : <span className="text-xs text-gray-500 font-semibold px-2 py-1 rounded-full bg-gray-200 hover:bg-gray-300">Mark Paid</span>}
                  </button>
                </div>
                <div className="space-y-2">

                    <input type="text" placeholder="Description (e.g., 'Trip Fee')" value={feeDetails['Additional']?.description || ''} onChange={(e) => handleFeeChange('Additional', 'description', e.target.value)} className="w-full px-2 py-1 border-gray-300 rounded-md text-sm focus:ring-indigo-500 focus:border-indigo-500" />
                    <div className="grid grid-cols-3 gap-4"> 
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-600">Fee:</span>
                       <input type="number" value={feeDetails['Additional']?.amount || ''} onChange={(e) => handleFeeChange('Additional', 'amount', Number(e.target.value))} className="w-full px-2 py-1 border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500" />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-600">Fine:</span>
                       <input type="number" value={feeDetails['Additional']?.fine || ''} onChange={(e) => handleFeeChange('Additional', 'fine', Number(e.target.value))} className="w-full px-2 py-1 border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500" />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-600">Remarks:</span>
                        <input type="text" placeholder="e.g., Online" value={feeDetails['Additional']?.remarks || ''} onChange={(e) => handleFeeChange('Additional', 'remarks', e.target.value)} className="w-full px-2 py-1 border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500" />
                      </div>
                    </div>
                </div>
Next           </div>
            </section>
            <footer className="mt-6 pt-4 border-t">
              <div className="grid grid-cols-3 gap-4 text-center mb-6">
                <div>
                  <h4 className="text-sm font-semibold text-gray-500">Total Due</h4>
                  <p className="text-2xl font-bold text-gray-800">Rs. {feeSummaryCalc(feeDetails).totalDue.toLocaleString()}</p>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-500">Total Paid</h4>
                  <p className="text-2xl font-bold text-green-600">Rs. {feeSummaryCalc(feeDetails).totalPaid.toLocaleString()}</p>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-500">Balance</h4>
                  <p className={`text-2xl font-bold ${feeSummaryCalc(feeDetails).balance > 0 ? 'text-red-600' : 'text-gray-800'}`}>Rs. {feeSummaryCalc(feeDetails).balance.toLocaleString()}</p>
                </div>
              </div>
              <div className="flex justify-end gap-4">
                <button onClick={() => setSelectedStudent(null)} className="px-6 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition">Close</button>
                <button onClick={handleSaveFeeDetails} disabled={isSaving} className="px-6 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition disabled:bg-green-400">{isSaving ? 'Saving...' : 'Save Changes'}</button>
              </div>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};

// ... (feeSummaryCalc utility function remains the same and correctly handles 'fine')
function feeSummaryCalc(fees) {
  if (!fees || Object.keys(fees).length === 0) return { totalDue: 0, totalPaid: 0, balance: 0 };
  
  const totalDue = Object.values(fees).reduce((s,m) => s + (Number(m.amount) || 0) + (Number(m.fine) || 0), 0);
 
  const totalPaid = Object.values(fees).reduce((s,m) => {
    const monthlyTotal = (Number(m.amount) || 0) + (Number(m.fine) || 0);
    return s + ((m.paid ? monthlyTotal : 0) || 0);
  }, 0);
  
  return { totalDue, totalPaid, balance: totalDue - totalPaid };
}

export default StudentDetailsPage;
