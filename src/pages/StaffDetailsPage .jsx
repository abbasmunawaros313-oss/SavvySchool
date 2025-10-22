import React, { useState, useEffect, useMemo } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { db } from '../firebase';
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc
} from 'firebase/firestore';
import {
  FaUsers,
  FaMoneyBillWave,
  FaMoneyCheck,
  FaFileInvoiceDollar,
  FaUserPlus,
  FaEdit,
  FaTrash,
  FaSearch,
  FaFilter,
  FaTimes,
  FaCheck,
  FaSave,
  FaSpinner,
  FaPrint,
  FaUserMinus
} from 'react-icons/fa';
// Import for PDF Generation (jsPDF only)
import jsPDF from 'jspdf';

// -----------------------------
// Constants & Initializers
// -----------------------------
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// Generate a list of years for filtering
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR + 1, CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2, CURRENT_YEAR - 3];

// This now creates a salary object for a single year, aware of the joining date
const createYearlySalaryObject = (monthlySalary, targetYear, joiningDate) => {
  const s = {};
  const amount = Number(monthlySalary) || 0;
  
  let joiningYear = 0;
  let joiningMonth = -1; // Month index (0-11)

  if (joiningDate) {
    try {
      // Handles 'YYYY-MM-DD'
      const dateParts = joiningDate.split('-').map(Number);
      joiningYear = dateParts[0];
      joiningMonth = dateParts[1] - 1; // Convert to 0-indexed month
    } catch (e) {
      console.error("Error parsing joining date:", joiningDate, e);
    }
  }

  // If the target year is *before* the staff joined, all salaries are 0
  if (targetYear < joiningYear) {
    MONTHS.forEach(m => s[m] = { amount: 0, paid: false, deduction: 0 });
    return s;
  }

  // If the target year is *the same as* the joining year
  if (targetYear === joiningYear) {
    MONTHS.forEach((m, index) => {
      // If the month is *before* the joining month, salary is 0
      if (index < joiningMonth) {
        s[m] = { amount: 0, paid: false, deduction: 0 };
      } else {
        // From the joining month onward, use the default salary
        s[m] = { amount, paid: false, deduction: 0 };
      }
    });
    return s;
  }

  // If the target year is *after* the joining year (or no joining date), create a full default year
  MONTHS.forEach(m => s[m] = { amount, paid: false, deduction: 0 });
  return s;
};

// Helper now passes joining date info
const getSalariesForYear = (staff, year) => {
  // ** This function now expects the FULL staff object from Firestore **
  // 'staff.salaries' should be the map { 2024: {...}, 2025: {...} }
  if (staff.salaries && staff.salaries[year]) {
    return staff.salaries[year];
  }
  // If no data for that year, create it based on default monthly salary AND joining date
  return createYearlySalaryObject(staff.monthlySalary, year, staff.joiningDate);
};


// -----------------------------
// Reusable UI Components
// -----------------------------
const StatCard = ({ title, value, icon, color, onClick, isActive }) => (
  <div
    onClick={onClick}
    className={`relative p-5 rounded-2xl shadow-lg overflow-hidden transition-all duration-300 ease-in-out transform hover:-translate-y-1 hover:shadow-2xl ${color} ${onClick ? 'cursor-pointer' : ''} ${isActive ? 'ring-4 ring-white ring-opacity-70' : ''}`}
  >
    <div className="relative z-10">
      <h3 className="text-base font-semibold text-white text-opacity-90 truncate">{title}</h3>
      <p className="text-3xl font-bold mt-2 text-white">{value}</p>
    </div>
    <div className="absolute -bottom-4 -right-4 opacity-20 text-white text-6xl">
      {icon}
    </div>
  </div>
);

const Loader = ({ size = 'w-5 h-5' }) => (
  <FaSpinner className={`animate-spin ${size}`} />
);

// -----------------------------
// Main Staff Component
// -----------------------------
const StaffDetailsPage = () => {
  // Data States
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);

  // UI & Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
  const [salaryFilter, setSalaryFilter] = useState({ month: 'all', status: 'all' });
  const [showOnlyUnpaid, setShowOnlyUnpaid] = useState(false);

  // Modal & CRUD States
  const [staffToEdit, setStaffToEdit] = useState(null);
  const [isAddOrEditModalOpen, setAddOrEditModalOpen] = useState(false);
  const [staffToDelete, setStaffToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [salaryDetails, setSalaryDetails] = useState({}); // This will hold one year's salary data
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingSalary, setIsSavingSalary] = useState(false);

  // -----------------------------
  // Firebase Data Fetch
  // -----------------------------
  useEffect(() => {
    setLoading(true);
    const unsub = onSnapshot(collection(db, 'staff_details'), (snapshot) => {
      const arr = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setStaffList(arr);
      setLoading(false);
    }, (err) => {
      console.error('Firestore fetch error:', err);
      toast.error('Failed to fetch staff data.');
      setLoading(false);
    });
    return () => unsub();
  }, []);
  
  // Helper to format date for display
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      // Assuming dateString is 'YYYY-MM-DD'
      const date = new Date(dateString + 'T00:00:00'); // Add time to avoid timezone issues
      return date.toLocaleDateString('en-GB', { // e.g., dd/mm/yyyy
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch (e) {
      return dateString; // Fallback
    }
  };

  // -----------------------------
  // Derived Data & Calculations
  // -----------------------------

  // Calculates summary based on 'selectedYear'
  const staffWithSalarySummary = useMemo(() => {
    return staffList.map(s => {
      // 's' is from staffList (Firestore). 's.salaries' is the FULL map { 2024: ..., 2025: ... }
      // getSalariesForYear correctly finds s.salaries[selectedYear] or creates defaults
      const salariesForYear = getSalariesForYear(s, selectedYear);
      
      const totalSalary = Object.values(salariesForYear).reduce((sum, m) => sum + Number(m.amount || 0), 0);
      const totalPaid = Object.values(salariesForYear).reduce((sum, m) => sum + (m.paid ? Number(m.amount) : 0), 0);
      const totalDeductions = Object.values(salariesForYear).reduce((sum, m) => sum + Number(m.deduction || 0), 0);
      const balance = totalSalary - totalPaid - totalDeductions;
      
      return {
        ...s,
        salaries: salariesForYear, // 'salaries' prop is NOW just for the selectedYear
        allSalaries: s.salaries || {}, // 'allSalaries' is the full object from Firestore
        monthlySalary: Number(s.monthlySalary) || 0,
        totalSalary, // total for the selected year
        totalPaid, // total for the selected year
        totalDeductions, // total for the selected year
        balance // total for the selected year
      };
    });
  }, [staffList, selectedYear]);

  // Memo for 'active' staff
  const activeStaff = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return staffWithSalarySummary
      .filter(s => s.status !== 'left') // Only show 'active' staff
      .filter(s => !showOnlyUnpaid || s.balance > 0)
      .filter(s => {
        if (salaryFilter.month === 'all') return true;
        // 's.salaries' here is the pre-computed summary for the selectedYear
        const monthSalary = s.salaries?.[salaryFilter.month];
        if (!monthSalary || Number(monthSalary.amount) <= 0) return salaryFilter.status === 'unpaid';
        if (salaryFilter.status === 'all') return true;
        return salaryFilter.status === 'paid' ? !!monthSalary.paid : !monthSalary.paid;
      })
      .filter(s => !term || s.name?.toLowerCase().includes(term));
  }, [staffWithSalarySummary, searchTerm, salaryFilter, showOnlyUnpaid]);

  // Memo for 'left' staff
  const leftStaff = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return staffWithSalarySummary
      .filter(s => s.status === 'left') // Only show 'left' staff
      .filter(s => !term || s.name?.toLowerCase().includes(term));
  }, [staffWithSalarySummary, searchTerm]);


  // Stats are dynamic based on month filter AND selectedYear
  const displayStats = useMemo(() => {
    const month = salaryFilter.month;
    const isAllMonths = month === 'all';
    
    let totalSalary = 0;
    let totalGiven = 0;
    let totalDeductions = 0;

    // Use activeStaff list for global stats
    activeStaff.forEach(staff => {
      if (isAllMonths) {
        // 'staff.totalSalary' etc. are already calculated for the selectedYear
        totalSalary += staff.totalSalary;
        totalGiven += staff.totalPaid;
        totalDeductions += staff.totalDeductions;
      } else {
        // 'staff.salaries' is the summary for the selectedYear
        const monthData = staff.salaries?.[month];
        if (monthData) {
          totalSalary += Number(monthData.amount || 0);
          totalGiven += monthData.paid ? Number(monthData.amount || 0) : 0;
          totalDeductions += Number(monthData.deduction || 0);
        }
      }
    });
    
    const totalRemaining = totalSalary - totalGiven - totalDeductions;
    const monthSuffix = isAllMonths ? '' : ` (${month})`;
    const cardTitleSuffix = `(${selectedYear}${monthSuffix})`;

    return {
      totalSalary,
      totalGiven,
      totalRemaining,
      totalDeductions,
      cardTitleSuffix
    };
  }, [activeStaff, salaryFilter.month, selectedYear]);

  // -----------------------------
  // Event Handlers & Modal Functions
  // -----------------------------
  const clearAllFilters = () => {
    setSearchTerm('');
    setSalaryFilter({ month: 'all', status: 'all' });
    setShowOnlyUnpaid(false);
    setSelectedYear(CURRENT_YEAR);
  };

  // handleSaveStaff (for Add/Edit modal)
  const handleSaveStaff = async (e) => {
    e.preventDefault();
    if (
      !selectedStaff?.name?.trim() ||
      !selectedStaff?.monthlySalary ||
      Number(selectedStaff.monthlySalary) < 0 ||
      !selectedStaff?.joiningDate // Validate joiningDate
    ) {
      toast.warn('Please fill a valid Name, Monthly Salary, and Joining Date.');
      return;
    }

    setIsSaving(true);
    const newMonthlySalary = Number(selectedStaff.monthlySalary);
    const status = selectedStaff.status || 'active';
    const joiningDate = selectedStaff.joiningDate;
    const contactNumber = selectedStaff.contactNumber?.trim() || ''; // Get contactNumber

    try {
      if (staffToEdit) {
        // EDITING EXISTING STAFF
        const oldMonthlySalary = Number(staffToEdit.monthlySalary);
        const existingSalaries = staffToEdit.allSalaries || {};
        let updatedSalaries = JSON.parse(JSON.stringify(existingSalaries)); // Deep copy

        if (newMonthlySalary !== oldMonthlySalary) {
          Object.keys(updatedSalaries).forEach(year => {
            Object.keys(updatedSalaries[year]).forEach(month => {
              const monthData = updatedSalaries[year][month];
              if (!monthData.paid && (monthData.amount === oldMonthlySalary || monthData.amount === 0)) {
                monthData.amount = newMonthlySalary;
              }
            });
          });
        }

        const data = {
          name: selectedStaff.name.trim(),
          monthlySalary: newMonthlySalary,
          salaries: updatedSalaries,
          status: status,
          joiningDate: joiningDate,
          contactNumber: contactNumber // Save contactNumber
        };
        await updateDoc(doc(db, 'staff_details', staffToEdit.id), data);
        toast.success('Staff updated successfully!');

      } else {
        // ADDING NEW STAFF
        const data = {
          name: selectedStaff.name.trim(),
          monthlySalary: newMonthlySalary,
          salaries: {}, // Start with an empty salaries object
          status: status,
          joiningDate: joiningDate,
          contactNumber: contactNumber // Save contactNumber
        };
        await addDoc(collection(db, 'staff_details'), data);
        toast.success('Staff added successfully!');
      }
      setAddOrEditModalOpen(false);
      setStaffToEdit(null);
      setSelectedStaff(null);
    } catch (err) {
      console.error("Error saving staff:", err);
      toast.error('Error saving staff data.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteStaff = async () => {
    if (!staffToDelete) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'staff_details', staffToDelete.id));
      toast.success('Staff deleted successfully!');
      setStaffToDelete(null);
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete staff.');
    } finally {
      setIsDeleting(false);
    }
  };

  // handleSaveSalaryDetails (for Salary modal)
  const handleSaveSalaryDetails = async () => {
    if (!selectedStaff) return;
    setIsSavingSalary(true);
    
    // 'selectedStaff' is from staffWithSalarySummary
    // 'selectedStaff.allSalaries' is the full map from Firestore
    // 'salaryDetails' is the modified state for the 'selectedYear'
    const newAllSalaries = {
      ...selectedStaff.allSalaries, 
      [selectedYear]: salaryDetails 
    };

    try {
      await updateDoc(doc(db, 'staff_details', selectedStaff.id), { salaries: newAllSalaries });
      toast.success('Salary details updated successfully!');
      setSelectedStaff(null);
    } catch (err) {
      console.error(err);
      toast.error('Failed to update salary details.');
    } finally {
      setIsSavingSalary(false);
    }
  };

  // PDF Print Handler (jsPDF only, no autotable)
 // NEW: PDF Print Handler (jsPDF only, no autotable)
  const handlePrintReport = () => {
    if (!selectedStaff || !salaryDetails) return;

    const doc = new jsPDF();
    const staff = selectedStaff;
    const salaries = salaryDetails; // This is the salary data for the selectedYear
    const summary = salaryModalSummary; // Already calculated

    // --- Define Layout & Colors ---
    let yPos = 20;
    const leftMargin = 15;
    const rightMargin = 195; // Page width is 210
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const lineSpacing = 7;
    const sectionSpacing = 12;
    const headerColor = '#F3F4F6'; // Light gray
    const rowColor = '#F9FAFB'; // Lighter gray
    const fontColor = '#111827'; // Dark gray
    const subFontColor = '#6B7280'; // Medium gray

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(fontColor);

    // --- 1. Page Header ---
    
    // Logo Placeholder
    doc.setDrawColor(subFontColor);
    doc.roundedRect(leftMargin, yPos - 5, 25, 25, 2, 2, 'S');
    doc.setFontSize(10);
    doc.setTextColor(subFontColor);
   
    doc.setTextColor(fontColor);

    // School Name (Centered)
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('The Savvy School ', pageWidth / 2, yPos, { align: 'center' });
    yPos += lineSpacing;

    // Report Title (Centered)
    doc.setFontSize(14);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(subFontColor);
    doc.text('Staff Salary Report', pageWidth / 2, yPos, { align: 'center' });
    yPos += sectionSpacing * 2;

    // Header Line
    doc.setDrawColor(headerColor);
    doc.line(leftMargin, yPos, rightMargin, yPos);
    yPos += sectionSpacing;

    // --- 2. Staff Details ---
    const detailCol1 = leftMargin;
    const detailCol2 = leftMargin + 35;

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Staff Details', detailCol1, yPos);
    yPos += lineSpacing * 1.5;

    doc.setFont('helvetica', 'normal');
    
    doc.setTextColor(subFontColor);
    doc.text('Staff Name:', detailCol1, yPos);
    doc.setTextColor(fontColor);
    doc.text(staff.name, detailCol2, yPos);

    // Go to next column
    const detailCol3 = leftMargin + 100;
    const detailCol4 = leftMargin + 120;

    doc.setTextColor(subFontColor);
    doc.text('Year:', detailCol3, yPos);
    doc.setTextColor(fontColor);
    doc.text(String(selectedYear), detailCol4, yPos);
    yPos += lineSpacing;

    doc.setTextColor(subFontColor);
    doc.text('Contact:', detailCol1, yPos);
    doc.setTextColor(fontColor);
    doc.text(staff.contactNumber || 'N/A', detailCol2, yPos);

    doc.setTextColor(subFontColor);
    doc.text('Joined:', detailCol3, yPos);
    doc.setTextColor(fontColor);
    doc.text(formatDate(staff.joiningDate), detailCol4, yPos);
    yPos += sectionSpacing;


    // --- 3. Annual Summary ---
    doc.setDrawColor(headerColor);
    doc.line(leftMargin, yPos, rightMargin, yPos);
    yPos += sectionSpacing;

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Annual Summary', leftMargin, yPos);
    yPos += lineSpacing * 1.5;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');

    const summaryCol1 = leftMargin + 10;
    const summaryCol2 = leftMargin + 50;

    doc.setTextColor(subFontColor);
    doc.text('Total Salary:', summaryCol1, yPos);
    doc.setTextColor(fontColor);
    doc.text(`Rs. ${summary.totalSalary.toLocaleString()}`, summaryCol2, yPos);
    yPos += lineSpacing;

    doc.setTextColor(subFontColor);
    doc.text('Total Paid:', summaryCol1, yPos);
    doc.setTextColor(fontColor);
    doc.text(`Rs. ${summary.totalPaid.toLocaleString()}`, summaryCol2, yPos);
    yPos += lineSpacing;

    doc.setTextColor(subFontColor);
    doc.text('Total Deductions:', summaryCol1, yPos);
    doc.setTextColor(fontColor);
    doc.text(`Rs. ${summary.totalDeductions.toLocaleString()}`, summaryCol2, yPos);
    yPos += lineSpacing;
    
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(subFontColor);
    doc.text('Balance Due:', summaryCol1, yPos);
    doc.setTextColor(fontColor);
    doc.text(`Rs. ${summary.balance.toLocaleString()}`, summaryCol2, yPos);
    yPos += sectionSpacing;


    // --- 4. Monthly Breakdown Section ---
    doc.setDrawColor(headerColor);
    doc.line(leftMargin, yPos, rightMargin, yPos);
    yPos += sectionSpacing;

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Monthly Details', leftMargin, yPos);
    yPos += lineSpacing * 1.5;

    // Define column positions
    const col1 = leftMargin;      // Month
    const col2 = leftMargin + 40; // Salary
    const col3 = leftMargin + 75; // Deduction
    const col4 = leftMargin + 110; // Net
    const col5 = leftMargin + 145; // Status

    // Table Header
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setFillColor(headerColor); // Light gray background for header
    doc.rect(leftMargin, yPos - 5, rightMargin - leftMargin, lineSpacing, 'F');
    doc.setTextColor(fontColor);
    doc.text('Month', col1 + 2, yPos);
    doc.text('Salary (Rs)', col2 + 2, yPos);
    doc.text('Deduction (Rs)', col3 + 2, yPos);
    doc.text('Net (Rs)', col4 + 2, yPos);
    doc.text('Status', col5 + 2, yPos);
    yPos += lineSpacing;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);

    let rowNum = 0;

    // Table Rows
    MONTHS.forEach(month => {
      // Check for page break
      if (yPos > pageHeight - 30) { // Near bottom margin
        doc.addPage();
        yPos = 20; // Reset yPos for new page
        // Re-add table headers on new page
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setFillColor(headerColor);
        doc.rect(leftMargin, yPos - 5, rightMargin - leftMargin, lineSpacing, 'F');
        doc.setTextColor(fontColor);
        doc.text('Month', col1 + 2, yPos);
        doc.text('Salary (Rs)', col2 + 2, yPos);
        doc.text('Deduction (Rs)', col3 + 2, yPos);
        doc.text('Net (Rs)', col4 + 2, yPos);
        doc.text('Status', col5 + 2, yPos);
        yPos += lineSpacing;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        rowNum = 0; // Reset row count for new page
      }

      // Alternating row color
      if (rowNum % 2 === 0) {
        doc.setFillColor(rowColor);
        doc.rect(leftMargin, yPos - 5, rightMargin - leftMargin, lineSpacing, 'F');
      }

      const data = salaries[month] || { amount: 0, deduction: 0, paid: false };
      const net = (data.amount || 0) - (data.deduction || 0);
      const status = data.paid ? "Paid" : "Unpaid";

      doc.setTextColor(fontColor);
      doc.text(month, col1 + 2, yPos);
      doc.text(Number(data.amount || 0).toLocaleString(), col2 + 2, yPos);
      doc.text(Number(data.deduction || 0).toLocaleString(), col3 + 2, yPos);
      doc.text(net.toLocaleString(), col4 + 2, yPos);
      
      // Color status
      doc.setTextColor(data.paid ? '#059669' : '#DC2626'); // Green or Red
      doc.text(status, col5 + 2, yPos);

      yPos += lineSpacing;
      rowNum++;
    });

    // --- 5. Page Footer (Applied to all pages) ---
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i); // Go to page
        const currentY = pageHeight - 15;
        doc.setDrawColor(headerColor);
        doc.line(leftMargin, currentY, rightMargin, currentY); // Footer line
        
        doc.setFontSize(9);
        doc.setTextColor(subFontColor);
        doc.text(`Generated on: ${new Date().toLocaleDateString('en-GB')}`, leftMargin, currentY + 5);
        doc.text(`Page ${i} of ${totalPages}`, pageWidth / 2, currentY + 5, { align: 'center' });
    }

    // --- Save the PDF ---
    doc.save(`Salary_Report_${staff.name}_${selectedYear}.pdf`);
    toast.success('Report generated!');
  };

  // openAddModal (for Add/Edit modal)
  const openAddModal = () => {
    setStaffToEdit(null);
    setSelectedStaff({ 
      name: '', 
      monthlySalary: '', 
      status: 'active', 
      joiningDate: '', // Initialize joiningDate
      contactNumber: '' // Initialize contactNumber
    });
    setAddOrEditModalOpen(true);
  };

  // openEditModal (for Add/Edit modal)
  const openEditModal = (staff) => {
    setStaffToEdit(staff);
    // 'staff' is from staffWithSalarySummary
    setSelectedStaff({ 
      ...staff, 
      status: staff.status || 'active',
      joiningDate: staff.joiningDate || '', // Load joiningDate
      contactNumber: staff.contactNumber || '' // Load contactNumber
    });
    setAddOrEditModalOpen(true);
  };

  // =================================================================
  // !!! THIS IS THE FIXED FUNCTION !!!
  // =================================================================
  const openSalaryModal = (staff) => {
    // 'staff' is from staffWithSalarySummary
    setSelectedStaff(staff); 
    
    // 'staff.salaries' ALREADY has the correct data for the selectedYear,
    // as calculated by staffWithSalarySummary. We don't need to call getSalariesForYear again.
    const salariesForYear = staff.salaries; // <--- THIS IS THE FIX
    
    // Deep copy this data into the modal's local state
    setSalaryDetails(JSON.parse(JSON.stringify(salariesForYear)));
  };
  // =================================================================

  const handleTogglePaid = (month) => {
    setSalaryDetails(prev => ({
      ...prev,
      // Ensure the month object exists before trying to spread it
      [month]: { ...(prev[month] || {}), paid: !prev[month]?.paid }
    }));
  };

  // This calculation remains correct, as 'salaryDetails' only holds one year's data
  const salaryModalSummary = useMemo(() => {
    if (!selectedStaff) return { totalSalary: 0, totalPaid: 0, totalDeductions: 0, balance: 0 };
    const totalSalary = Object.values(salaryDetails).reduce((sum, m) => sum + Number(m.amount || 0), 0);
    const totalPaid = Object.values(salaryDetails).reduce((sum, m) => sum + (m.paid ? Number(m.amount) : 0), 0);
    const totalDeductions = Object.values(salaryDetails).reduce((sum, m) => sum + Number(m.deduction || 0), 0);
    return { totalSalary, totalPaid, totalDeductions, balance: totalSalary - totalPaid - totalDeductions };
  }, [salaryDetails, selectedStaff]);
  
  // -----------------------------
  // Render JSX
  // -----------------------------
  return (
    <div className="p-4 md:p-8 bg-gray-50 min-h-screen font-sans">
      <ToastContainer position="top-right" autoClose={3000} hideProgressBar={true} />

      <header className="mb-6">
        <h1 className="text-3xl md:text-4xl font-bold text-gray-800">Staff Management</h1>
      </header>

      {/* Statistics Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title={`Total Salary ${displayStats.cardTitleSuffix}`}
          value={`Rs. ${displayStats.totalSalary.toLocaleString()}`}
          icon={<FaMoneyBillWave />}
          color="bg-gradient-to-br from-blue-500 to-blue-600"
        />
        <StatCard
          title={`Salary Paid ${displayStats.cardTitleSuffix}`}
          value={`Rs. ${displayStats.totalGiven.toLocaleString()}`}
          icon={<FaMoneyCheck />}
          color="bg-gradient-to-br from-green-500 to-green-600"
        />
        <StatCard
          title={`Deductions ${displayStats.cardTitleSuffix}`}
          value={`Rs. ${displayStats.totalDeductions.toLocaleString()}`}
          icon={<FaFileInvoiceDollar />}
          color="bg-gradient-to-br from-yellow-500 to-yellow-600"
        />
        <StatCard
          title={`Balance ${displayStats.cardTitleSuffix}`}
          value={`Rs. ${displayStats.totalRemaining.toLocaleString()}`}
          icon={<FaFileInvoiceDollar />}
          color="bg-gradient-to-br from-red-500 to-red-600"
          onClick={() => setShowOnlyUnpaid(!showOnlyUnpaid)}
          isActive={showOnlyUnpaid}
        />
      </section>

      {/* Filters and Search */}
      <section className="mb-6 p-4 bg-white rounded-xl shadow-md">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 items-end">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Search Staff</label>
            <div className="relative">
              <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Search by name..." className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
          </div>
          
          {/* Year Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Filter by Year</label>
            <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg" >
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Filter by Month</label>
            <select value={salaryFilter.month} onChange={(e) => setSalaryFilter(p => ({ ...p, month: e.target.value }))} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg" >
              <option value="all">All Months</option>
              {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Salary Status</label>
            <select value={salaryFilter.status} onChange={(e) => setSalaryFilter(p => ({ ...p, status: e.target.value }))} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg" disabled={salaryFilter.month === 'all'} >
              <option value="all">Any</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Unpaid</option>
            </select>
          </div>
          <button onClick={openAddModal} className="lg:col-span-5 md:col-span-3 flex items-center justify-center px-4 py-2.5 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 transition transform hover:scale-105" >
            <FaUserPlus className="h-5 w-5 mr-2" /> Add New Staff
          </button>
        </div>
        {(searchTerm || salaryFilter.month !== 'all' || showOnlyUnpaid || selectedYear !== CURRENT_YEAR) && (
          <div className="mt-4">
            <button onClick={clearAllFilters} className="flex items-center text-sm px-3 py-1 bg-red-100 text-red-700 font-semibold rounded-full hover:bg-red-200 transition" >
              <FaTimes className="h-4 w-4 mr-1" /> Clear All Filters
            </button>
          </div>
        )}
      </section>


      {/* Active Staff Table */}
      <main className="bg-white shadow-xl rounded-2xl overflow-hidden">
        <h2 className="text-xl font-bold text-gray-700 p-5 border-b">Active Staff ({selectedYear})</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100">
              <tr>
                {/* Added Contact & Joining Date columns */}
                {["Name", "Contact", "Joining Date", `Total Salary (${selectedYear})`, `Paid (${selectedYear})`, `Deductions (${selectedYear})`, `Balance (${selectedYear})`, "Actions"].map(h => (
                  <th key={h} className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                // ColSpan is now 8
                <tr><td colSpan="8" className="text-center py-12 text-gray-500"><div className="flex justify-center items-center"><Loader size="w-6 h-6" /><span className="ml-2">Loading staff...</span></div></td></tr>
              ) : activeStaff.length > 0 ? (
                activeStaff.map(s => (
                  <tr key={s.id} className="hover:bg-indigo-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{s.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{s.contactNumber || 'N/A'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{formatDate(s.joiningDate)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800 font-semibold">Rs. {s.totalSalary.toLocaleString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">Rs. {s.totalPaid.toLocaleString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-yellow-700">Rs. {s.totalDeductions.toLocaleString()}</td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-semibold ${s.balance > 0 ? 'text-red-600' : 'text-gray-800'}`}>Rs. {s.balance.toLocaleString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center gap-2">
                        <button onClick={() => openSalaryModal(s)} className="px-3 py-2 bg-indigo-100 text-indigo-700 font-semibold rounded-full hover:bg-indigo-200">Salary</button>
                        <button onClick={() => openEditModal(s)} className="p-2 text-gray-500 hover:text-blue-600 rounded-full"><FaEdit className="h-5 w-5" /></button>
                        <button onClick={() => setStaffToDelete(s)} className="p-2 text-gray-500 hover:text-red-600 rounded-full"><FaTrash className="h-5 w-5" /></button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                // ColSpan is now 8
                <tr><td colSpan="8" className="text-center py-12 text-gray-500">No active staff found matching filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </main>

      {/* Left Staff Table */}
      {leftStaff.length > 0 && (
        <main className="mt-12 bg-white shadow-xl rounded-2xl overflow-hidden">
          <h2 className="text-xl font-bold text-gray-700 p-5 border-b flex items-center">
            <FaUserMinus className="mr-3 text-red-500" />
            Left Staff ({selectedYear})
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-100">
                <tr>
                  {/* Added Contact & Joining Date columns */}
                  {["Name", "Contact", "Joining Date", `Total Salary (${selectedYear})`, `Paid (${selectedYear})`, `Deductions (${selectedYear})`, `Balance (${selectedYear})`, "Actions"].map(h => (
                    <th key={h} className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {leftStaff.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50 transition-colors opacity-80">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{s.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{s.contactNumber || 'N/A'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{formatDate(s.joiningDate)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800 font-semibold">Rs. {s.totalSalary.toLocaleString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">Rs. {s.totalPaid.toLocaleString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-yellow-700">Rs. {s.totalDeductions.toLocaleString()}</td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-semibold ${s.balance > 0 ? 'text-red-600' : 'text-gray-800'}`}>Rs. {s.balance.toLocaleString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center gap-2">
                        <button onClick={() => openSalaryModal(s)} className="px-3 py-2 bg-indigo-100 text-indigo-700 font-semibold rounded-full hover:bg-indigo-200">View</button>
                        <button onClick={() => openEditModal(s)} className="p-2 text-gray-500 hover:text-blue-600 rounded-full"><FaEdit className="h-5 w-5" /></button>
                        <button onClick={() => setStaffToDelete(s)} className="p-2 text-gray-500 hover:text-red-600 rounded-full"><FaTrash className="h-5 w-5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      )}


      {/* Add/Edit Staff Modal (Added Contact Number field) */}
      {isAddOrEditModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-lg">
            <h2 className="text-2xl font-bold mb-6">{staffToEdit ? 'Edit Staff Details' : 'Add New Staff'}</h2>
            <form onSubmit={handleSaveStaff}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                  <input type="text" placeholder="Enter full name" value={selectedStaff?.name || ''} onChange={(e) => setSelectedStaff(s => ({ ...s, name: e.target.value }))} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" required />
                </div>
                
                {/* Contact Number Field */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contact Number</label>
                  <input type="tel" placeholder="e.g., 03001234567" value={selectedStaff?.contactNumber || ''} onChange={(e) => setSelectedStaff(s => ({ ...s, contactNumber: e.target.value }))} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
                </div>

                {/* Joining Date Field */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Joining Date</label>
                  <input type="date" value={selectedStaff?.joiningDate || ''} onChange={(e) => setSelectedStaff(s => ({ ...s, joiningDate: e.target.value }))} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" required />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Default Monthly Salary</label>
                  <input type="number" placeholder="Enter monthly salary" value={selectedStaff?.monthlySalary || ''} onChange={(e) => setSelectedStaff(s => ({ ...s, monthlySalary: e.target.value }))} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" required />
                </div>
                
                {/* Status Field */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Staff Status</label>
                  <select value={selectedStaff?.status || 'active'} onChange={(e) => setSelectedStaff(s => ({ ...s, status: e.target.value }))} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" >
                    <option value="active">Active</option>
                    <option value="left">Left</option>
                  </select>
                </div>
              </div>
              <div className="mt-8 flex justify-end gap-4">
                <button type="button" onClick={() => { setStaffToEdit(null); setAddOrEditModalOpen(false); }} className="px-6 py-3 bg-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-300 transition" > Cancel </button>
                <button type="submit" disabled={isSaving} className="px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:bg-indigo-400 flex items-center justify-center min-w-[120px] transition" >
                  {isSaving ? <><Loader /> Saving...</> : <><FaSave className="mr-2" /> Save</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {staffToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md">
            <h2 className="text-2xl font-bold mb-4">Confirm Deletion</h2>
            <p className="text-gray-600 mb-6">Are you sure you want to delete <span className="font-semibold">{staffToDelete.name}</span>? This action cannot be undone.</p>
            <div className="flex justify-end gap-4">
              <button onClick={() => setStaffToDelete(null)} className="px-6 py-3 bg-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-300 transition">Cancel</button>
              <button onClick={handleDeleteStaff} disabled={isDeleting} className="px-6 py-3 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 disabled:bg-red-400 flex items-center justify-center min-w-[120px] transition">
                {isDeleting ? <><Loader className="mr-2" /> Deleting...</> : <><FaTrash className="mr-2" /> Delete</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Salary Details Modal */}
    {selectedStaff && !isAddOrEditModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <header className="flex-shrink-0">
              <h2 className="text-2xl font-bold">Salary Details: {selectedStaff.name} ({selectedYear})</h2>
              <p className="text-gray-600">Update monthly salary amounts, deductions, and payment status for {selectedYear}.</p>
            </header>

            {/* Monthly details section */}
            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4 flex-grow overflow-y-auto pr-2">
              {MONTHS.map(month => (
                <div key={month} className={`p-4 rounded-xl border-2 transition-colors ${salaryDetails[month]?.paid ? 'border-green-400 bg-green-50' : 'border-gray-300 bg-white'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-700">{month}</h3>
                    <button onClick={() => handleTogglePaid(month)} className={`p-2 rounded-full transition-colors ${salaryDetails[month]?.paid ? 'bg-green-100 text-green-600 hover:bg-green-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      {salaryDetails[month]?.paid ? <FaCheck /> : <FaTimes />}
                    </button>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-gray-600">Salary Amount:</label>
                      <input type="number" value={salaryDetails[month]?.amount || ''} onChange={(e) => setSalaryDetails(p => ({...p, [month]: { ...(p[month] || {}), amount: Number(e.target.value) }}))} className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"/>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-600">Deduction:</label>
                      <input type="number" value={salaryDetails[month]?.deduction || ''} onChange={(e) => setSalaryDetails(p => ({ ...p, [month]: { ...(p[month] || {}), deduction: Number(e.target.value) }}))} className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent"/>
                    </div>
                  </div>
                </div>
              ))}  
            </section>

            {/* Footer summary */}
            <footer className="mt-6 pt-4 border-t flex-shrink-0">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center mb-6">
                <div><h4 className="text-sm text-gray-600">Total Salary</h4><p className="text-2xl font-bold">Rs. {salaryModalSummary.totalSalary.toLocaleString()}</p></div>
                <div><h4 className="text-sm text-gray-600">Total Paid</h4><p className="text-2xl font-bold text-green-600">Rs. {salaryModalSummary.totalPaid.toLocaleString()}</p></div>
                <div><h4 className="text-sm text-gray-600">Deductions</h4><p className="text-2xl font-bold text-yellow-700">Rs. {salaryModalSummary.totalDeductions.toLocaleString()}</p></div>
                <div><h4 className="text-sm text-gray-600">Balance</h4><p className={`text-2xl font-bold ${salaryModalSummary.balance > 0 ? 'text-red-600' : 'text-gray-800'}`}>Rs. {salaryModalSummary.balance.toLocaleString()}</p></div>
              </div>
              <div className="flex flex-wrap justify-between items-center gap-4">
                {/* Print Button */}
                <button onClick={handlePrintReport} className="px-6 py-3 bg-blue-100 text-blue-700 font-semibold rounded-lg hover:bg-blue-200 flex items-center justify-center transition">
                  <FaPrint className="mr-2" /> Print Report
                </button>
                <div className="flex justify-end gap-4 flex-grow">
                  <button onClick={() => setSelectedStaff(null)} className="px-6 py-3 bg-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-300 transition">Close</button>
                  <button onClick={handleSaveSalaryDetails} disabled={isSavingSalary} className="px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:bg-green-400 flex items-center justify-center min-w-[150px] transition">
                    {isSavingSalary ? <><Loader className="mr-2" /> Saving...</> : <><FaSave className="mr-2" /> Save Changes</>}
                  </button>
                </div>
              </div>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};

export default StaffDetailsPage;
