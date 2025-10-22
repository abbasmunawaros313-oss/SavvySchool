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
  deleteDoc,
  Timestamp, // Ensure Timestamp is imported
  // NEW: Import deleteField if you want to completely remove the field on reactivate
  // import { deleteField } from 'firebase/firestore';
} from 'firebase/firestore';
import { db } from '../firebase';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import {
    HiUserGroup, HiOutlinePencilAlt, HiOutlineTrash, HiFilter, HiX
} from 'react-icons/hi';
import {
    FaUserPlus, FaFilePdf, FaMoneyBillWave, FaUserMinus, FaUserCheck, FaSearch, FaCalendarDay
} from 'react-icons/fa'; // FaUserMinus/FaUserCheck no longer needed in table
import { IoSparkles } from 'react-icons/io5';
import { AiFillCloseCircle, AiOutlineExclamationCircle } from 'react-icons/ai';
import { BsCheckLg, BsXLg } from 'react-icons/bs';
import { FaSpinner } from 'react-icons/fa';

import jsPDF from 'jspdf';

// -----------------------------
// Constants
// -----------------------------
const MONTHS = [ /* ... unchanged ... */
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR + 1, CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2, CURRENT_YEAR - 3];
const createInitialFees = () => { /* ... unchanged ... */
  const f = {};
  MONTHS.forEach(m => f[m] = { amount: 0, paid: false, remarks: '', fine: 0 });
  f['Additional'] = { amount: 0, paid: false, description: '', remarks: '', fine: 0 };
  return f;
};
const CLASS_GRADIENTS = [ /* ... unchanged ... */
    'bg-gradient-to-br from-purple-500 to-purple-700',
    'bg-gradient-to-br from-pink-500 to-pink-700',
    'bg-gradient-to-br from-teal-500 to-teal-700',
    'bg-gradient-to-br from-rose-500 to-rose-700',
    'bg-gradient-to-br from-cyan-500 to-cyan-700',
    'bg-gradient-to-br from-lime-500 to-lime-700',
    'bg-gradient-to-br from-fuchsia-500 to-fuchsia-700',
    'bg-gradient-to-br from-indigo-500 to-indigo-700',
];
const ITEMS_PER_PAGE = 10;

// -----------------------------
// Small UI bits
// -----------------------------
const StatCard = ({ title, value, icon, color, onClick, isActive }) => ( /* ... unchanged ... */
    <div
    onClick={onClick}
    className={`relative p-5 md:p-6 rounded-2xl shadow-lg overflow-hidden transition-all duration-300 ease-in-out transform hover:-translate-y-1 hover:shadow-2xl ${color} ${onClick ? 'cursor-pointer' : ''} ${isActive ? 'ring-4 ring-white ring-opacity-80 shadow-indigo-300' : ''}`}
  >
    <div className="relative z-10">
      <h3 className="text-md font-semibold text-white text-opacity-90 truncate">{title}</h3>
      <p className="text-3xl md:text-4xl font-bold mt-2 text-white">{value}</p>
    </div>
    <div className="absolute -bottom-4 -right-4 opacity-15 text-white">
      {React.cloneElement(icon, { className: "w-20 h-20 md:w-24 md:h-24" })}
    </div>
  </div>
);
const Loader = ({ size = 'w-5 h-5', color = 'text-white' }) => <FaSpinner className={`animate-spin ${size} ${color}`} />;
const formatDate = (timestamp) => { /* ... unchanged ... */
    if (!timestamp) return 'N/A';
    try {
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric'});
    } catch (e) { return 'Invalid Date'; }
};

// -----------------------------
// Modal for listing Left Students
// -----------------------------
const LeftListModal = ({ isOpen, onClose, title, list }) => { /* ... unchanged ... */
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60] p-4 transition-opacity duration-300">
          <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col transform transition-all scale-100 opacity-100">
            <header className="flex justify-between items-center pb-4 border-b mb-4">
              <h2 className="text-2xl font-bold text-gray-800 flex items-center">
                <FaUserSlash className="mr-3 text-red-500"/>
                {title}
              </h2>
              <button onClick={onClose} className="p-2 text-gray-400 hover:text-red-600 rounded-full transition-colors">
                <AiFillCloseCircle className="w-7 h-7" />
              </button>
            </header>
            <div className="overflow-y-auto flex-grow pr-2">
              {list.length > 0 ? (
                <ul className="divide-y divide-gray-200">
                  {list.map(item => (
                    <li key={item.id} className="py-4 flex flex-col sm:flex-row justify-between sm:items-center gap-2 px-2">
                      <div>
                        <p className="text-lg font-semibold text-gray-900">{item.name}</p>
                        <p className="text-sm text-gray-500">
                            Class: <span className="font-medium text-gray-700">{item.studentClass}</span> | Roll No: <span className="font-medium text-gray-700">{item.rollNumber}</span>
                        </p>
                      </div>
                      <div className="mt-2 sm:mt-0 text-sm text-gray-700 bg-red-100 text-red-800 px-3 py-1 rounded-full font-medium">
                          Left Date: {formatDate(item.leftDate)}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-center py-10 text-gray-500 italic">No students found in this category.</p>
              )}
            </div>
          </div>
        </div>
      );
};

// REMOVED: MarkLeftModal component is no longer needed

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
  const [statusFilter, setStatusFilter] = useState('active');
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);

  // CRUD / Modals
  const [studentToEdit, setStudentToEdit] = useState(null); // Will hold status and leftDate during edit
  const [isAddOrEditModalOpen, setAddOrEditModalOpen] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fee modal
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [feeDetails, setFeeDetails] = useState({});
  const [isSaving, setIsSaving] = useState(false); // General saving state

  // selection / export
  const [selectedStudents, setSelectedStudents] = useState(new Set());
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);

  // Left List Modal state
  const [listModalData, setListModalData] = useState({ isOpen: false, title: '', list: [] });

  // REMOVED: studentToMarkLeft, isMarkingLeft states


  // -----------------------------
  // Firestore: real-time fetch
  // -----------------------------
  useEffect(() => { /* ... unchanged ... */
    setLoading(true);
    const unsub = onSnapshot(collection(db, 'students_details'), snapshot => {
      const arr = snapshot.docs.map(d => ({
          id: d.id, ...d.data(), status: d.data().status || 'active'
      }));
      setStudents(arr);
      setTimeout(() => setLoading(false), 200);
    }, err => { console.error('fetch error', err); toast.error('Failed to fetch students.'); setLoading(false); });
    return () => unsub();
  }, []);

  // -----------------------------
  // Derived data: fee summaries
  // -----------------------------
  const studentsWithFeeSummary = useMemo(() => { /* ... unchanged ... */
    return students.map(s => {
      const feesForYear = s.fees?.[selectedYear] || createInitialFees();
      const { totalDue, totalPaid, balance } = feeSummaryCalc(feesForYear);
      return { ...s, fees: s.fees || {}, feesForSelectedYear: feesForYear, totalDue, totalPaid, balance };
    });
  }, [students, selectedYear]);

  // -----------------------------
  // Filtering / searching
  // -----------------------------
  const filteredStudents = useMemo(() => { /* ... unchanged ... */
    const term = searchTerm.trim().toLowerCase();
    return studentsWithFeeSummary
      .filter(s => statusFilter === 'all' || s.status === statusFilter)
      .filter(s => !classFilter || s.studentClass === classFilter)
      .filter(s => {
        if (feeFilter.month === 'all') return true;
        const fr = s.feesForSelectedYear?.[feeFilter.month];
        const totalMonthlyDue = (Number(fr?.amount) || 0) + (Number(fr?.fine) || 0);
        if (!fr || totalMonthlyDue <= 0) return feeFilter.status === 'unpaid';
        if (feeFilter.status === 'all') return true;
        return feeFilter.status === 'paid' ? !!fr.paid : !fr.paid;
      })
      .filter(s => !term || (s.name?.toLowerCase().includes(term) || s.studentClass?.toLowerCase().includes(term) || String(s.rollNumber).toLowerCase().includes(term)));
  }, [studentsWithFeeSummary, classFilter, feeFilter, searchTerm, statusFilter]);

  // -----------------------------
  // Stats: global and filtered
  // -----------------------------
  const globalStats = useMemo(() => { /* ... unchanged ... */
    const activeStudents = students.filter(s => s.status === 'active');
    const totalStudents = activeStudents.length;
    const leftStudentsCount = students.length - totalStudents;
    const studentsByClass = activeStudents.reduce((acc, s) => { const name = s.studentClass?.trim() || 'Unassigned'; acc[name] = (acc[name] || 0) + 1; return acc; }, {});
    const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const newStudentsCount = activeStudents.filter(s => s.admissionDate?.toDate ? s.admissionDate.toDate() > thirtyDaysAgo : false).length;
    return { totalStudents, studentsByClass, newStudentsCount, leftStudentsCount };
  }, [students]);
  const filteredStats = useMemo(() => { /* ... unchanged ... */
    const totalFeesCollected = filteredStudents.reduce((sum, s) => sum + (s.totalPaid || 0), 0);
    const totalOutstandingBalance = filteredStudents.reduce((sum, s) => sum + (s.balance || 0), 0);
    return { totalFeesCollected, totalOutstandingBalance };
  }, [filteredStudents]);

  // -----------------------------
  // Pagination Logic
  // -----------------------------
  const totalPages = Math.ceil(filteredStudents.length / ITEMS_PER_PAGE);
  const paginatedStudents = useMemo(() => { /* ... unchanged ... */
    const start = (currentPage - 1) * ITEMS_PER_PAGE; const end = start + ITEMS_PER_PAGE;
    return filteredStudents.slice(start, end);
  }, [filteredStudents, currentPage]);
  useEffect(() => { /* ... unchanged ... */
    setCurrentPage(1); setSelectedStudents(new Set());
  }, [searchTerm, classFilter, feeFilter, statusFilter, selectedYear]);

  // -----------------------------
  // Handlers: filters & selections
  // -----------------------------
  const handleFilterChange = (name, value) => { /* ... unchanged ... */
     if (name === 'feeMonth') setFeeFilter(prev => ({ ...prev, month: value, status: value === 'all' ? 'all' : prev.status }));
     else if (name === 'feeStatus') setFeeFilter(prev => ({ ...prev, status: value }));
     else if (name === 'classFilter') setClassFilter(value);
     else if (name === 'searchTerm') setSearchTerm(value);
     else if (name === 'statusFilter') setStatusFilter(value);
     else if (name === 'selectedYear') setSelectedYear(Number(value));
  };
  const clearAllFilters = () => { /* ... unchanged ... */
    setSearchTerm(''); setClassFilter(null); setFeeFilter({ month: 'all', status: 'all' });
    setStatusFilter('active'); setSelectedYear(CURRENT_YEAR); setSelectedStudents(new Set());
  };
  const handleSelectStudent = (id, checked) => { /* ... unchanged ... */
    setSelectedStudents(prev => { const copy = new Set(prev); if (checked) copy.add(id); else copy.delete(id); return copy; });
  };
  const handleSelectAll = (checked) => { /* ... unchanged ... */
    if (checked) setSelectedStudents(new Set(filteredStudents.map(s => s.id))); else setSelectedStudents(new Set());
  };


  // -----------------------------
  // Add / Edit Student (MODIFIED TO INCLUDE STATUS & LEFT DATE)
  // -----------------------------
  const openAddModal = () => {
    // Set default status for new students
    setStudentToEdit({ name: '', studentClass: '', rollNumber: '', status: 'active', leftDate: '' });
    setAddOrEditModalOpen(true);
  };

  const openEditModal = (student) => {
    // Load existing status and potentially leftDate (convert Timestamp to YYYY-MM-DD for input)
    const currentLeftDate = student.leftDate?.toDate ? student.leftDate.toDate().toISOString().split('T')[0] : '';
    setStudentToEdit({ ...student, status: student.status || 'active', leftDate: currentLeftDate });
    setAddOrEditModalOpen(true);
  };

  // MODIFIED: Handles saving status and leftDate
  const handleAddOrEditStudent = async (e) => {
    e.preventDefault();
    if (!studentToEdit) return;
    const { id, name, studentClass, rollNumber, status, leftDate } = studentToEdit; // Get status and leftDate

    if (!name?.trim() || !studentClass?.trim() || !rollNumber?.trim()) {
        toast.warn('Please fill Name, Class, and Roll Number.');
        return;
    }
    // Validate leftDate only if status is 'left'
    if (status === 'left' && !leftDate) {
        toast.warn('Please select a Leaving Date when status is "Left".');
        return;
    }

    setIsSaving(true);
    const dataToSave = {
        name: name.trim(),
        studentClass: studentClass.trim(),
        rollNumber: rollNumber.trim(),
        status: status, // Save the selected status
    };

    // Conditionally add/remove leftDate
    if (status === 'left') {
        // Convert YYYY-MM-DD string back to Firestore Timestamp
        dataToSave.leftDate = Timestamp.fromDate(new Date(leftDate + 'T00:00:00'));
    } else {
        // If status is active, ensure leftDate is removed or null
        dataToSave.leftDate = null; // Or use `deleteField()` if preferred
    }

    try {
        if (id) { // Editing existing student
            await updateDoc(doc(db, 'students_details', id), dataToSave);
            toast.success('Student details updated successfully!');
        } else { // Adding new student (status is handled above, leftDate won't apply yet)
            const q = query(collection(db, 'students_details'),
                where('name', '==', dataToSave.name),
                where('studentClass', '==', dataToSave.studentClass),
                where('rollNumber', '==', dataToSave.rollNumber)
            );
            const snap = await getDocs(q);
            if (!snap.empty) {
                toast.error('A student with the exact same details already exists.'); setIsSaving(false); return;
            }
            await addDoc(collection(db, 'students_details'), {
                ...dataToSave, // Includes status: 'active' and leftDate: null from defaults
                admissionDate: Timestamp.now(),
                // Initialize fees ONLY for the currently selected year when adding
                fees: { [selectedYear]: createInitialFees() }
            });
            toast.success('Student added successfully!');
        }
        setAddOrEditModalOpen(false);
        setStudentToEdit(null);
    } catch (err) {
        console.error("Error saving student:", err);
        toast.error('Failed to save student details. Please try again.');
    } finally {
        setIsSaving(false);
    }
  };


  // -----------------------------
  // Delete Student
  // -----------------------------
  const confirmDelete = (student) => setStudentToDelete(student);
  const handleDeleteStudent = async () => { /* ... unchanged ... */
    if (!studentToDelete) return; setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'students_details', studentToDelete.id));
      toast.success(`Student '${studentToDelete.name}' deleted successfully.`);
      setStudentToDelete(null);
      setSelectedStudents(prev => { const copy = new Set(prev); copy.delete(studentToDelete.id); return copy; });
    } catch (err) { console.error("Error deleting student:", err); toast.error('Failed to delete student.');
    } finally { setIsDeleting(false); }
  };

  // REMOVED: handleMarkAsLeftClick, handleConfirmLeft, handleReactivateStudent handlers

  // -----------------------------
  // Fee modal open / edit / save
  // -----------------------------
    const handleOpenFeeModal = (student) => { /* ... unchanged ... */
        setSelectedStudent(student);
        const feesForSelectedYear = student.fees?.[selectedYear] || createInitialFees();
        const cloned = JSON.parse(JSON.stringify(feesForSelectedYear)); setFeeDetails(cloned);
    };
    const handleFeeChange = (month, field, value) => { /* ... unchanged ... */
        const numValue = (field === 'amount' || field === 'fine') ? Number(value) : value;
        setFeeDetails(prev => ({ ...prev, [month]: { ...(prev[month] || {}), [field]: numValue } }));
    };
    const handleTogglePaid = (month) => { /* ... unchanged ... */
        setFeeDetails(prev => ({ ...prev, [month]: { ...(prev[month] || {}), paid: !prev[month]?.paid } }));
    };
    const handleSaveFeeDetails = async () => { /* ... unchanged ... */
        if (!selectedStudent) return; setIsSaving(true);
        try {
            const updatedFees = { ...selectedStudent.fees, [selectedYear]: feeDetails };
            await updateDoc(doc(db, 'students_details', selectedStudent.id), { fees: updatedFees });
            toast.success(`Fee details updated for ${selectedYear}.`); setSelectedStudent(null);
        } catch (err) { console.error("Error saving fee details:", err); toast.error('Failed to update fee details.');
        } finally { setIsSaving(false); }
    };

  // -----------------------------
  // PDF Generation
  // -----------------------------
   const generateStudentListReport = (studentsToExport, title) => { /* ... unchanged ... */
        if (!studentsToExport || studentsToExport.length === 0) { toast.warn('No students selected or filtered for the report.'); return; }
        setIsGeneratingPdf(true);
        setTimeout(() => {
            try {
                const doc = new jsPDF(); let y = 18; const margin = 14; const pageHeight = doc.internal.pageSize.height; const pageWidth = doc.internal.pageSize.width; const lineSpacing = 6; const sectionSpacing = 8;
                doc.setFontSize(20); doc.setFont('helvetica', 'bold'); doc.text("Savvy School", pageWidth / 2, y, { align: 'center' }); y += 7;
                doc.setFontSize(12); doc.setFont('helvetica', 'normal'); doc.text("Quaid-e-Azam Campus", pageWidth / 2, y, { align: 'center' }); y += 7;
                doc.setFontSize(15); doc.setFont('helvetica', 'bold'); doc.text(`Student Fee Report (${selectedYear})`, pageWidth / 2, y, { align: 'center' }); y += sectionSpacing;
                doc.setFontSize(10); doc.setFont('helvetica', 'italic'); doc.text(`Report Type: ${title}`, margin, y); y += lineSpacing;
                doc.text(`Filters: Class: ${classFilter || 'All'}, Status: ${statusFilter}, Fee Month: ${feeFilter.month}, Fee Status: ${feeFilter.status}`, margin, y); y += sectionSpacing;

                studentsToExport.forEach((student, index) => {
                    if (y > pageHeight - 50) { doc.addPage(); y = margin; }
                    if (index > 0) { doc.setDrawColor(200); doc.setLineWidth(0.2); doc.line(margin, y, pageWidth - margin, y); y += 5; }
                    doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.text(`${student.name}`, margin, y);
                    doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.text(`Class: ${student.studentClass} | Roll No: ${student.rollNumber}`, margin + 50, y, { maxWidth: 80 });
                    doc.text(`Status: ${student.status}`, pageWidth - margin, y, { align: 'right' }); y += lineSpacing + 2;

                    const col1 = margin + 2, col2 = margin + 45, col3 = margin + 75, col4 = margin + 100, col5 = margin + 125;
                    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setFillColor(235, 235, 235); doc.setDrawColor(200); doc.setLineWidth(0.1); doc.rect(margin, y, pageWidth - 2 * margin, 6, 'FD'); doc.setTextColor(50);
                    doc.text("Month", col1, y + 4); doc.text("Fee", col2, y + 4); doc.text("Fine", col3, y + 4); doc.text("Status", col4, y + 4); doc.text("Remarks", col5, y + 4);
                    y += 6; doc.setTextColor(0);

                    MONTHS.forEach(month => {
                        if (y > pageHeight - 15) {
                            doc.addPage(); y = margin; doc.setFontSize(8); doc.setFont('helvetica','italic'); doc.text(`(Continuation for ${student.name} - ${selectedYear})`, margin, y); y += 6;
                            doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setFillColor(235, 235, 235); doc.setDrawColor(200); doc.setLineWidth(0.1); doc.rect(margin, y, pageWidth - 2 * margin, 6, 'FD'); doc.setTextColor(50);
                            doc.text("Month", col1, y + 4); doc.text("Fee", col2, y + 4); doc.text("Fine", col3, y + 4); doc.text("Status", col4, y + 4); doc.text("Remarks", col5, y + 4);
                            y += 6; doc.setTextColor(0);
                        }
                        doc.setFontSize(9); doc.setFont('helvetica', 'normal');
                        const fee = student.feesForSelectedYear[month] || { amount: 0, paid: false, remarks: '', fine: 0 };
                        const amount = Number(fee.amount || 0); const fine = Number(fee.fine || 0); const totalMonthly = amount + fine;
                        const status = totalMonthly > 0 ? (fee.paid ? 'Paid' : 'Unpaid') : '-'; const remarks = fee.remarks || '-';
                        doc.text(month.substring(0,3), col1, y + 4); doc.text(amount > 0 ? amount.toLocaleString() : '-', col2, y + 4); doc.text(fine > 0 ? fine.toLocaleString() : '-', col3, y + 4);
                        if (status === 'Paid') doc.setTextColor(0, 100, 0); else if (status === 'Unpaid') doc.setTextColor(200, 0, 0); else doc.setTextColor(150);
                        doc.text(status, col4, y + 4); doc.setTextColor(0);
                        const remarksWidth = doc.getTextWidth(remarks); const maxRemarksWidth = (pageWidth - margin) - col5;
                        const truncatedRemarks = remarksWidth > maxRemarksWidth ? doc.splitTextToSize(remarks, maxRemarksWidth - 2)[0] + '..' : remarks;
                        doc.text(truncatedRemarks, col5, y + 4);
                        y += 6;
                    });

                    if (y > pageHeight - 15) { doc.addPage(); y = margin; }
                     const addFee = student.feesForSelectedYear['Additional'] || { amount: 0, paid: false, description: '', remarks: '', fine: 0};
                     const addAmount = Number(addFee.amount || 0); const addFine = Number(addFee.fine || 0); const addTotal = addAmount + addFine;
                     const addStatus = addTotal > 0 ? (addFee.paid ? 'Paid' : 'Unpaid') : '-'; const addDesc = addFee.description || 'Additional Fee'; const addRemarks = addFee.remarks || '-';
                     doc.setFont('helvetica', 'italic'); doc.text(addDesc.substring(0,15)+(addDesc.length > 15 ? '..' : ''), col1, y + 4);
                     doc.text(addAmount > 0 ? addAmount.toLocaleString() : '-', col2, y + 4); doc.text(addFine > 0 ? addFine.toLocaleString() : '-', col3, y + 4);
                     if (addStatus === 'Paid') doc.setTextColor(0, 100, 0); else if (addStatus === 'Unpaid') doc.setTextColor(200, 0, 0); else doc.setTextColor(150);
                     doc.text(addStatus, col4, y + 4); doc.setTextColor(0); doc.text(addRemarks, col5, y + 4); y += 8;

                    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setDrawColor(200); doc.setLineWidth(0.2); doc.line(margin, y, pageWidth - margin, y); y += 5;
                    doc.text(`Summary (${selectedYear}):`, margin, y); doc.text(`Due: Rs. ${student.totalDue.toLocaleString()}`, margin + 50, y); doc.text(`Paid: Rs. ${student.totalPaid.toLocaleString()}`, margin + 90, y);
                    doc.setTextColor(student.balance > 0 ? 200 : 0, 0, 0); doc.text(`Balance: Rs. ${student.balance.toLocaleString()}`, margin + 135, y);
                    doc.setTextColor(0); y += sectionSpacing;
                });

                const pageCount = doc.internal.getNumberOfPages();
                for(let i = 1; i <= pageCount; i++) {
                    doc.setPage(i); doc.setFontSize(8); doc.setFont('helvetica', 'italic'); doc.setTextColor(150);
                    doc.text(`Generated on: ${new Date().toLocaleDateString('en-GB')}`, margin, pageHeight - 8);
                    doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, pageHeight - 8, { align: 'center' });
                    doc.text("Savvy School QAC", pageWidth - margin, pageHeight - 8, { align: 'right' });
                }
                doc.save(`Student_Fee_Report_${selectedYear}_${new Date().toISOString().split('T')[0]}.pdf`);
                toast.success("PDF Report generated successfully!");
            } catch (error) { toast.error("An error occurred while generating the PDF."); console.error("PDF generation failed:", error);
            } finally { setIsGeneratingPdf(false); }
        }, 150);
    };
    const handleExportFiltered = () => { generateStudentListReport(filteredStudents, `Filtered Students (${statusFilter})`); };
    const handleExportSelected = () => { /* ... unchanged ... */
        const studentsToExport = studentsWithFeeSummary.filter(s => selectedStudents.has(s.id));
        generateStudentListReport(studentsToExport, "Selected Students");
    };


  // -----------------------------
  // Render
  // -----------------------------
  return (
    <div className="p-4 md:p-8 bg-gradient-to-br from-gray-50 to-indigo-100 min-h-screen font-sans">
      <ToastContainer position="top-right" autoClose={3000} hideProgressBar={false} newestOnTop />

      {/* -- Modals -- */}
      <LeftListModal /* ... props ... */
        isOpen={listModalData.isOpen}
        onClose={() => setListModalData({ isOpen: false, title: '', list: [] })}
        title={listModalData.title}
        list={listModalData.list}
       />
      {/* REMOVED MarkLeftModal */}

      {/* -- Header -- */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
            <h1 className="text-3xl md:text-4xl font-bold text-gray-800 flex items-center">
                <HiUserGroup className="mr-3 text-indigo-500" />Student Management
            </h1>
            <button
                onClick={handleExportFiltered}
                disabled={isGeneratingPdf || filteredStudents.length === 0}
                className={`flex items-center gap-2 bg-white rounded-lg shadow px-4 py-2 text-sm md:text-base font-medium transition-all duration-200 ease-in-out ${
                isGeneratingPdf || filteredStudents.length === 0 ? 'text-gray-400 cursor-not-allowed bg-gray-100' : 'text-red-700 hover:bg-red-50 hover:shadow-md' }`}
                title={filteredStudents.length === 0 ? "No students to export based on current filters" : "Export filtered list to PDF"} >
                <FaFilePdf className={` ${isGeneratingPdf || filteredStudents.length === 0 ? '' : 'text-red-600'}`} />
                {isGeneratingPdf ? <Loader size="w-4 h-4" color="text-gray-500" /> : null}
                {isGeneratingPdf ? 'Generating...' : 'Export PDF'}
            </button>
      </header>

      {/* -- Stat Cards -- */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-5 mb-8">
            <StatCard title="Active Students" value={globalStats.totalStudents} icon={<HiUserGroup />} color="bg-gradient-to-br from-blue-500 to-blue-700" onClick={() => handleFilterChange('classFilter', null)} isActive={!classFilter && statusFilter === 'active'} />
            {/* MODIFIED: Left Students card */}
            <StatCard title="Left Students" value={globalStats.leftStudentsCount} icon={<FaUserMinus />} color="bg-gradient-to-br from-red-500 to-red-700" onClick={() => openListModal('Left Students', students.filter(s => s.status === 'left'))} />
            <StatCard title="Fees Collected" value={`Rs. ${filteredStats.totalFeesCollected.toLocaleString()}`} icon={<FaMoneyBillWave />} color="bg-gradient-to-br from-green-500 to-green-700" />
            <StatCard title="Pending Balance" value={`Rs. ${filteredStats.totalOutstandingBalance.toLocaleString()}`} icon={<AiOutlineExclamationCircle />} color="bg-gradient-to-br from-orange-500 to-orange-700" />
            <StatCard title="New Students (30d)" value={globalStats.newStudentsCount} icon={<IoSparkles />} color="bg-gradient-to-br from-yellow-400 to-yellow-600" />
            {Object.entries(globalStats.studentsByClass)
              .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
              .map(([className, count], index) => (
                <StatCard key={className} title={`Class: ${className}`} value={count} icon={<HiUserGroup />} color={CLASS_GRADIENTS[index % CLASS_GRADIENTS.length]} onClick={() => handleFilterChange('classFilter', className)} isActive={classFilter === className} />
            ))}
      </section>

      {/* -- Filter Section -- */}
      <section className="mb-6 p-4 bg-white rounded-xl shadow-md border border-gray-200">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4 items-end">
          <div className="sm:col-span-2 xl:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Search Student</label>
            <div className="relative"> <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" /> <input type="text" placeholder="Name, class, roll no..." className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-shadow" value={searchTerm} onChange={(e) => handleFilterChange('searchTerm', e.target.value)} /> </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Year</label>
            <select value={selectedYear} onChange={(e) => handleFilterChange('selectedYear', e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-shadow bg-white"> {YEARS.map(y => <option key={y} value={y}>{y}</option>)} </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Fee Month</label>
            <select value={feeFilter.month} onChange={(e) => handleFilterChange('feeMonth', e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-shadow bg-white"> <option value="all">All Months</option> {MONTHS.map(m => <option key={m} value={m}>{m}</option>)} </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Fee Status</label>
            <select value={feeFilter.status} onChange={(e) => handleFilterChange('feeStatus', e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-shadow bg-white" disabled={feeFilter.month === 'all'}> <option value="all">Any Status</option> <option value="paid">Paid</option> <option value="unpaid">Unpaid</option> </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Student Status</label>
            <select value={statusFilter} onChange={(e) => handleFilterChange('statusFilter', e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-shadow bg-white"> <option value="active">Active</option> <option value="left">Left</option> <option value="all">All</option> </select>
          </div>
        </div>
        {(classFilter || feeFilter.month !== 'all' || statusFilter !== 'active' || searchTerm || selectedYear !== CURRENT_YEAR) && ( /* ... active filters display ... unchanged ... */
             <div className="mt-4 pt-3 border-t border-gray-200 flex items-center gap-3 flex-wrap">
                 <h3 className="text-sm font-semibold text-gray-600 flex items-center"><HiFilter className="mr-1"/>Active Filters:</h3>
                 {classFilter && <span className="text-indigo-700 bg-indigo-100 px-3 py-1 rounded-full text-xs font-medium">{classFilter}</span>}
                 {feeFilter.month !== 'all' && <span className="text-purple-700 bg-purple-100 px-3 py-1 rounded-full text-xs font-medium">{feeFilter.month} Fees: {feeFilter.status}</span>}
                 {statusFilter !== 'active' && <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusFilter === 'left' ? 'text-red-700 bg-red-100' : 'text-gray-700 bg-gray-200'}`}>Status: {statusFilter}</span>}
                 {searchTerm && <span className="text-blue-700 bg-blue-100 px-3 py-1 rounded-full text-xs font-medium">Search: "{searchTerm}"</span>}
                 {selectedYear !== CURRENT_YEAR && <span className="text-green-700 bg-green-100 px-3 py-1 rounded-full text-xs font-medium">Year: {selectedYear}</span>}
                 <button onClick={clearAllFilters} className="ml-auto flex items-center text-xs px-3 py-1 bg-red-100 text-red-700 font-semibold rounded-full hover:bg-red-200 transition-colors"> <HiX className="h-4 w-4 mr-1" /> Clear All Filters </button>
             </div>
        )}
      </section>

      {/* Add Student Button */}
       <div className="mb-4 flex justify-end"> <button onClick={openAddModal} className="flex items-center justify-center px-5 py-2.5 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 transition transform hover:scale-105 active:scale-95"> <FaUserPlus className="h-5 w-5 mr-2" /> Add New Student </button> </div>

      {/* -- Main Student Table -- */}
      <main className="bg-white shadow-xl rounded-2xl overflow-hidden border border-gray-200">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100">
              <tr>
                 <th className="px-4 py-4 w-12 text-center"> <input type="checkbox" onChange={(e) => handleSelectAll(e.target.checked)} checked={filteredStudents.length > 0 && selectedStudents.size === filteredStudents.length && selectedStudents.size > 0} disabled={filteredStudents.length === 0} className="rounded border-gray-400 focus:ring-indigo-500 disabled:bg-gray-300" title="Select all filtered students"/> </th>
                {["Name","Class","Roll No.","Total Due","Total Paid","Balance","Actions"].map((h,i) => ( <th key={h} className={`px-6 py-4 text-xs font-bold text-gray-600 uppercase tracking-wider ${i < 3 ? 'text-left' : i === 6 ? 'text-center' : 'text-right'}`}>{h}</th> ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? ( <tr><td colSpan="8" className="text-center py-16 text-gray-500"><Loader size="w-8 h-8" color="text-indigo-500" /></td></tr> )
               : paginatedStudents.length > 0 ? ( paginatedStudents.map(s => (
                  <tr key={s.id} className={`transition-colors duration-150 ease-in-out odd:bg-white even:bg-gray-50 hover:bg-indigo-100 group ${selectedStudents.has(s.id) ? '!bg-indigo-200' : ''} ${s.status === 'left' ? 'opacity-60 italic' : ''}`}>
                    <td className="px-4 py-4 text-center"> <input type="checkbox" checked={selectedStudents.has(s.id)} onChange={(e) => handleSelectStudent(s.id, e.target.checked)} className="rounded border-gray-400 focus:ring-indigo-500"/> </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{s.name}</div>
                        {s.status === 'left' && <div className="text-xs text-red-600 font-medium">Left: {formatDate(s.leftDate)}</div>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{s.studentClass}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{s.rollNumber}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 text-right">Rs. {s.totalDue.toLocaleString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-green-700 text-right">Rs. {s.totalPaid.toLocaleString()}</td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-semibold text-right ${s.balance > 0 ? 'text-red-700' : 'text-gray-800'}`}>Rs. {s.balance.toLocaleString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                      {/* MODIFIED: Removed Mark as Left/Reactivate buttons from here */}
                      <div className="flex justify-center items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200">
                        <button onClick={() => handleOpenFeeModal(s)} className="p-2 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-100 rounded-full transition-all" title="Manage Fees"><FaMoneyBillWave className="h-5 w-5" /></button>
                        <button onClick={() => openEditModal(s)} className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded-full transition-all" title="Edit Student"><HiOutlinePencilAlt className="h-5 w-5" /></button>
                        <button onClick={() => confirmDelete(s)} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-100 rounded-full transition-all" title="Delete Student"><HiOutlineTrash className="h-5 w-5" /></button>
                      </div>
                    </td>
                  </tr> ))
                ) : ( <tr><td colSpan="8" className="text-center py-16 text-gray-500 italic">No students found matching your criteria.</td></tr> )}
            </tbody>
          </table>
        </div>

        {/* -- Pagination Controls -- */}
        {totalPages > 1 && ( /* ... unchanged ... */
          <div className="flex flex-col sm:flex-row justify-between items-center py-3 px-4 sm:px-6 border-t border-gray-200 bg-gray-50">
            <div className="mb-2 sm:mb-0"> <span className="text-sm text-gray-700"> Page <span className="font-semibold">{currentPage}</span> of <span className="font-semibold">{totalPages}</span> <span className="hidden sm:inline"> | Total Matches: <span className="font-semibold">{filteredStudents.length}</span></span> </span> </div>
            <div className="flex gap-2"> <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"> Previous </button> <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"> Next </button> </div>
          </div>
        )}
      </main>

       {/* -- Modals: Add/Edit, Delete, Fee Details -- */}
        {isAddOrEditModalOpen && studentToEdit && (
            <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60] p-4 transition-opacity duration-300">
              <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-2xl w-full max-w-lg transform transition-all scale-100 opacity-100"> {/* Increased max-w */}
                 <header className="flex justify-between items-center pb-4 border-b mb-6">
                    <h2 className="text-2xl font-bold text-gray-800">{studentToEdit.id ? 'Edit Student Details' : 'Register New Student'}</h2>
                     <button onClick={() => { setAddOrEditModalOpen(false); setStudentToEdit(null); }} className="p-2 text-gray-400 hover:text-red-600 rounded-full transition-colors"> <AiFillCloseCircle className="w-7 h-7" /> </button>
                 </header>
                <form onSubmit={handleAddOrEditStudent}>
                  {/* MODIFIED: Added Status and conditional Left Date */}
                  <div className="space-y-5">
                     <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                        <input type="text" placeholder="Enter full name" value={studentToEdit.name} onChange={(e) => setStudentToEdit({...studentToEdit, name: e.target.value})} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow" required />
                     </div>
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                         <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Class</label>
                            <input type="text" placeholder="e.g., Class 10" value={studentToEdit.studentClass} onChange={(e) => setStudentToEdit({...studentToEdit, studentClass: e.target.value})} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow" required />
                         </div>
                         <div>
                             <label className="block text-sm font-medium text-gray-700 mb-1">Roll Number</label>
                            <input type="text" placeholder="Enter roll number" value={studentToEdit.rollNumber} onChange={(e) => setStudentToEdit({...studentToEdit, rollNumber: e.target.value})} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow" required />
                         </div>
                     </div>
                     {/* Status Dropdown */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                        <select
                            value={studentToEdit.status}
                            onChange={(e) => setStudentToEdit({...studentToEdit, status: e.target.value, leftDate: e.target.value === 'active' ? '' : studentToEdit.leftDate })} // Clear leftDate if switching back to active
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow bg-white"
                            required
                        >
                            <option value="active">Active</option>
                            <option value="left">Left</option>
                        </select>
                      </div>
                      {/* Conditional Leaving Date */}
                      {studentToEdit.status === 'left' && (
                          <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Leaving Date</label>
                              <div className="relative">
                                <FaCalendarDay className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                                <input
                                    type="date"
                                    value={studentToEdit.leftDate} // Already in YYYY-MM-DD format
                                    onChange={(e) => setStudentToEdit({...studentToEdit, leftDate: e.target.value})}
                                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow"
                                    required // Make required if status is 'left'
                                />
                               </div>
                          </div>
                      )}
                  </div>
                  <div className="mt-8 flex justify-end gap-4">
                    <button type="button" onClick={() => { setAddOrEditModalOpen(false); setStudentToEdit(null); }} className="px-6 py-2.5 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition-colors">Cancel</button>
                    <button type="submit" disabled={isSaving} className="px-6 py-2.5 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition disabled:bg-indigo-400 min-w-[120px] flex justify-center items-center"> {isSaving ? <Loader size="w-5 h-5"/> : (studentToEdit.id ? 'Save Changes' : 'Add Student')} </button>
                  </div>
                </form>
              </div>
            </div>
        )}

        {studentToDelete && ( /* ... Delete Modal unchanged ... */
            <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60] p-4 transition-opacity duration-300">
              <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md transform transition-all scale-100 opacity-100">
                <h2 className="text-2xl font-bold mb-4 text-gray-800">Confirm Deletion</h2>
                <p className="text-gray-600 mb-6">Are you sure you want to permanently delete <span className="font-semibold text-red-600">{studentToDelete.name}</span>? This action cannot be undone.</p>
                <div className="flex justify-end gap-4 mt-8">
                  <button type="button" onClick={() => setStudentToDelete(null)} className="px-6 py-2.5 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition-colors">Cancel</button>
                  <button type="button" onClick={handleDeleteStudent} disabled={isDeleting} className="px-6 py-2.5 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition disabled:bg-red-400 min-w-[140px] flex justify-center items-center"> {isDeleting ? <Loader size="w-5 h-5"/> : <><HiOutlineTrash className="mr-2"/>Confirm Delete</>} </button>
                </div>
              </div>
            </div>
        )}

        {selectedStudent && ( /* ... Fee Details Modal unchanged ... */
             <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4 transition-opacity duration-300">
              <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col transform transition-all scale-100 opacity-100">
                <header className="flex items-start justify-between pb-4 border-b mb-4">
                  <div> <h2 className="text-2xl font-bold text-gray-800">Fee Details ({selectedYear}): {selectedStudent.name}</h2> <p className="text-sm text-gray-500">Class: {selectedStudent.studentClass} | Roll No: {selectedStudent.rollNumber}</p> </div>
                   <button onClick={() => { setSelectedStudent(null); }} className="p-2 text-gray-400 hover:text-red-600 rounded-full transition-colors"> <AiFillCloseCircle className="w-7 h-7" /> </button>
                </header>
                <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 overflow-y-auto flex-grow pr-2 pb-4">
                  {MONTHS.map(month => (
                    <div key={month} className={`p-4 rounded-xl border-2 transition-all duration-200 ease-in-out ${feeDetails[month]?.paid ? 'border-green-300 bg-green-50 shadow-sm' : 'border-gray-300 bg-white hover:shadow-md'}`}>
                      <div className="flex items-center justify-between mb-3"> <h3 className="font-semibold text-gray-700">{month}</h3> <button onClick={() => handleTogglePaid(month)} className={`p-1.5 rounded-full transition-transform transform hover:scale-110 ${feeDetails[month]?.paid ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`} title={feeDetails[month]?.paid ? 'Mark as Unpaid' : 'Mark as Paid'}> {feeDetails[month]?.paid ? <BsCheckLg className="w-5 h-5" /> : <BsXLg className="w-5 h-5" />} </button> </div>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2"> <label htmlFor={`${month}-fee`} className="text-sm font-medium text-gray-600 w-14 shrink-0">Fee:</label> <div className="relative flex-grow"> <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">Rs.</span> <input id={`${month}-fee`} type="number" min="0" value={feeDetails[month]?.amount || ''} onChange={(e) => handleFeeChange(month, 'amount', e.target.value)} className="w-full pl-7 pr-2 py-1.5 border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm" /> </div> </div>
                        <div className="flex items-center gap-2"> <label htmlFor={`${month}-fine`} className="text-sm font-medium text-gray-600 w-14 shrink-0">Fine:</label> <div className="relative flex-grow"> <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">Rs.</span> <input id={`${month}-fine`} type="number" min="0" value={feeDetails[month]?.fine || ''} onChange={(e) => handleFeeChange(month, 'fine', e.target.value)} className="w-full pl-7 pr-2 py-1.5 border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm" /> </div> </div>
                        <div className="flex items-center gap-2"> <label htmlFor={`${month}-remarks`} className="text-sm font-medium text-gray-600 w-14 shrink-0">Remarks:</label> <input id={`${month}-remarks`} type="text" placeholder="e.g., Cash, Discount" value={feeDetails[month]?.remarks || ''} onChange={(e) => handleFeeChange(month, 'remarks', e.target.value)} className="w-full px-2 py-1.5 border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm" /> </div>
                      </div> </div> ))}
                  <div className={`p-4 rounded-xl border-2 col-span-1 md:col-span-2 lg:col-span-3 transition-all ${feeDetails['Additional']?.paid ? 'border-green-300 bg-green-50' : 'border-gray-300 bg-gray-50'}`}>
                    <div className="flex items-center justify-between mb-3"> <h3 className="font-semibold text-gray-700">Additional / Miscellaneous</h3> <button onClick={() => handleTogglePaid('Additional')} className={`p-1.5 rounded-full transition-transform transform hover:scale-110 ${feeDetails['Additional']?.paid ? 'bg-green-100 text-green-600' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`} title={feeDetails['Additional']?.paid ? 'Mark as Unpaid' : 'Mark as Paid'}> {feeDetails['Additional']?.paid ? <BsCheckLg className="w-5 h-5" /> : <BsXLg className="w-5 h-5"/>} </button> </div>
                    <div className="space-y-3">
                        <input type="text" placeholder="Description (e.g., 'Trip Fee', 'Exam Fee')" value={feeDetails['Additional']?.description || ''} onChange={(e) => handleFeeChange('Additional', 'description', e.target.value)} className="w-full px-3 py-2 border-gray-300 rounded-md text-sm focus:ring-indigo-500 focus:border-indigo-500" />
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="flex items-center gap-2"> <label htmlFor={`add-fee`} className="text-sm font-medium text-gray-600 shrink-0">Fee:</label> <div className="relative flex-grow"> <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">Rs.</span> <input id={`add-fee`} type="number" min="0" value={feeDetails['Additional']?.amount || ''} onChange={(e) => handleFeeChange('Additional', 'amount', e.target.value)} className="w-full pl-7 pr-2 py-1.5 border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm" /> </div> </div>
                            <div className="flex items-center gap-2"> <label htmlFor={`add-fine`} className="text-sm font-medium text-gray-600 shrink-0">Fine:</label> <div className="relative flex-grow"> <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">Rs.</span> <input id={`add-fine`} type="number" min="0" value={feeDetails['Additional']?.fine || ''} onChange={(e) => handleFeeChange('Additional', 'fine', e.target.value)} className="w-full pl-7 pr-2 py-1.5 border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm" /> </div> </div>
                            <div className="flex items-center gap-2"> <label htmlFor={`add-remarks`} className="text-sm font-medium text-gray-600 shrink-0">Remarks:</label> <input id={`add-remarks`} type="text" placeholder="Details..." value={feeDetails['Additional']?.remarks || ''} onChange={(e) => handleFeeChange('Additional', 'remarks', e.target.value)} className="w-full px-2 py-1.5 border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm" /> </div>
                        </div> </div> </div>
                </section>
                <footer className="mt-6 pt-6 border-t">
                  <div className="grid grid-cols-3 gap-4 text-center mb-6">
                    <div> <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Total Due</h4> <p className="text-xl md:text-2xl font-bold text-gray-800">Rs. {feeSummaryCalc(feeDetails).totalDue.toLocaleString()}</p> </div>
                    <div> <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Total Paid</h4> <p className="text-xl md:text-2xl font-bold text-green-600">Rs. {feeSummaryCalc(feeDetails).totalPaid.toLocaleString()}</p> </div>
                    <div> <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Balance</h4> <p className={`text-xl md:text-2xl font-bold ${feeSummaryCalc(feeDetails).balance > 0 ? 'text-red-600' : 'text-gray-800'}`}>Rs. {feeSummaryCalc(feeDetails).balance.toLocaleString()}</p> </div>
                  </div>
                  <div className="flex justify-end gap-4"> <button onClick={() => setSelectedStudent(null)} className="px-6 py-2.5 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition-colors">Close</button> <button onClick={handleSaveFeeDetails} disabled={isSaving} className="px-6 py-2.5 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition disabled:bg-green-400 min-w-[140px] flex justify-center items-center"> {isSaving ? <Loader size="w-5 h-5"/> : <><BsCheckLg className="mr-2"/> Save Changes</>} </button> </div>
                </footer> </div> </div>
        )}
    </div>
  );
};

// --- Utility Function ---
// Calculates fee summary based *only* on the fee object passed (expects one year's data)
function feeSummaryCalc(feesYearObject) { /* ... unchanged ... */
    if (!feesYearObject || typeof feesYearObject !== 'object' || Object.keys(feesYearObject).length === 0) return { totalDue: 0, totalPaid: 0, balance: 0 };
    let totalDue = 0; let totalPaid = 0;
    Object.values(feesYearObject).forEach(m => {
        const monthlyAmount = Number(m?.amount) || 0; const monthlyFine = Number(m?.fine) || 0; const monthlyTotal = monthlyAmount + monthlyFine;
        totalDue += monthlyTotal; if (m?.paid && monthlyTotal > 0) totalPaid += monthlyTotal;
    });
    return { totalDue, totalPaid, balance: totalDue - totalPaid };
}

export default StudentDetailsPage;
