import React, { useState, useEffect, useMemo } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { db } from '../firebase';
import {
  collection,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  Timestamp,
} from 'firebase/firestore';
import {
  FaDollarSign,
  FaCheckCircle,
  FaMoneyBillWave,
  FaReceipt,
  FaChartLine,
  FaPlus,
  FaTrash,
  FaTimes,
  FaSave,
  FaSpinner,
  FaCalendarAlt,
  FaUserGraduate,
  FaUserSlash,
  FaUsers,
  FaUserMinus,
  FaTimesCircle,
  FaPhone,
  FaFileInvoiceDollar // New icon for Add Expense
} from 'react-icons/fa';

// -----------------------------
// Constants
// -----------------------------
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// NEW: Generate a list of years for filtering
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR + 1, CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2, CURRENT_YEAR - 3];

// -----------------------------
// Reusable UI Components
// -----------------------------

// MODIFIED: Added onClick and hover effects for interactive cards
const StatCard = ({ title, value, icon, color, onClick }) => (
  <div
    onClick={onClick}
    className={`relative p-5 rounded-2xl shadow-lg overflow-hidden ${color} ${onClick ? 'cursor-pointer transition-transform transform hover:scale-105 hover:shadow-xl' : ''}`}
  >
    <div className="relative z-10">
      <h3 className="text-base font-semibold text-white text-opacity-90 truncate">{title}</h3>
      <p className="text-3xl font-bold mt-2 text-white">{value}</p>
    </div>
    <div className="absolute -bottom-4 -right-4 opacity-20 text-white text-7xl">{icon}</div>
  </div>
);

const Loader = ({ size = 'w-5 h-5', color = 'text-indigo-600' }) => <FaSpinner className={`animate-spin ${size} ${color}`} />;

// Helper to format date consistently
const formatDate = (timestamp) => {
    if (timestamp && timestamp.toDate) {
      return timestamp.toDate().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric'});
    }
    // Handle cases where date might be stored differently or is missing
    if (timestamp instanceof Date) {
        return timestamp.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric'});
    }
    return 'N/A';
};


// -----------------------------
// NEW: Modal for listing Left Students/Staff
// -----------------------------
const LeftListModal = ({ isOpen, onClose, title, list }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4 transition-opacity duration-300">
      <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col transform transition-all scale-100 opacity-100">
        <header className="flex justify-between items-center pb-4 border-b mb-4">
          <h2 className="text-2xl font-bold text-gray-800 flex items-center">
            {title === 'Left Students' ? <FaUserSlash className="mr-3 text-red-500"/> : <FaUserMinus className="mr-3 text-pink-500"/>}
            {title}
          </h2>
          <button onClick={onClose} className="p-2 text-gray-500 hover:text-red-600 rounded-full transition-colors">
            <FaTimesCircle className="w-7 h-7" />
          </button>
        </header>
        <div className="overflow-y-auto flex-grow pr-2">
          {list.length > 0 ? (
            <ul className="divide-y divide-gray-200">
              {list.map(item => (
                <li key={item.id} className="py-4 flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                  <div>
                    <p className="text-lg font-semibold text-gray-900">{item.name}</p>
                    {item.contactNumber && (
                      <p className="text-sm text-gray-600 flex items-center mt-1">
                        <FaPhone className="mr-2 h-3 w-3 text-gray-400" /> {item.contactNumber}
                      </p>
                    )}
                  </div>
                  <div className="mt-2 sm:mt-0 text-sm text-gray-700 bg-gray-100 px-3 py-1 rounded-full">
                      <strong>Left Date:</strong> {formatDate(item.leftDate)} {/* Assuming 'leftDate' field exists */}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-center py-10 text-gray-500 italic">No records found for this category.</p>
          )}
        </div>
      </div>
    </div>
  );
};


// -----------------------------
// Main Dashboard Component
// -----------------------------
const DashboardPage = () => {
  // Data States
  const [staffList, setStaffList] = useState([]);
  const [studentList, setStudentList] = useState([]);
  const [expenseList, setExpenseList] = useState([]);
  const [loading, setLoading] = useState(true);

  // UI & Filter States
  const [monthFilter, setMonthFilter] = useState('all');
  // NEW: Added year filter state
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);

  // Modal & CRUD States for Expense Form (now inline) & Delete Confirmation
  const [newExpense, setNewExpense] = useState({ description: '', cost: '', month: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // NEW: State for the list modal
  const [listModalData, setListModalData] = useState({ isOpen: false, title: '', list: [] });

  // -----------------------------
  // Firebase Data Fetching
  // -----------------------------
 useEffect(() => {
  setLoading(true);

  // Use temporary flags to ensure all snapshots have been received at least once
  let staffLoaded = false;
  let studentsLoaded = false;
  let expensesLoaded = false;

  const checkIfAllLoaded = () => {
    if (staffLoaded && studentsLoaded && expensesLoaded) {
      setLoading(false);
    }
  };

  const unsubStaff = onSnapshot(
    collection(db, 'staff_details'),
    (snap) => {
      setStaffList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      staffLoaded = true;
      checkIfAllLoaded();
    },
    (err) => {
      console.error("Error loading staff:", err);
      toast.error("Failed to load staff data.");
      setLoading(false);
    }
  );

  const unsubStudents = onSnapshot(
    collection(db, 'students_details'),
    (snap) => {
      setStudentList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      studentsLoaded = true;
      checkIfAllLoaded();
    },
    (err) => {
      console.error("Error loading students:", err);
      toast.error("Failed to load students data.");
      setLoading(false);
    }
  );

  const unsubExpenses = onSnapshot(
    collection(db, 'expenses'),
    (snap) => {
      setExpenseList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      expensesLoaded = true;
      checkIfAllLoaded();
    },
    (err) => {
      console.error("Error loading expenses:", err);
      toast.error("Failed to load expenses data.");
      setLoading(false);
    }
  );

  return () => {
    unsubStaff();
    unsubStudents();
    unsubExpenses();
  };
}, []);


  // -----------------------------
  // Derived Data & Calculations (NO LOGIC CHANGES HERE, only added new stats)
  // -----------------------------
  const dashboardStats = useMemo(() => {
    const isAllMonths = monthFilter === 'all';
    // Use selectedYear from state
    const currentYear = selectedYear;
    const monthIndex = MONTHS.indexOf(monthFilter);

    let totalFee = 0;
    let collectedFee = 0;
    let totalSalaries = 0;
    let salariesPaid = 0;

    // ----- Students Fees -----
    studentList.forEach(student => {
        // Access fees for the *selected year*
        const studentFees = student.fees?.[currentYear] || {};
        if (isAllMonths) {
            Object.values(studentFees).forEach(feeData => { /* ... Original Logic ... */
                if (feeData?.amount) { totalFee += Number(feeData.amount); if (feeData.paid) collectedFee += Number(feeData.amount);}
            });
        } else {
            const monthFeeData = studentFees[monthFilter]; /* ... Original Logic ... */
            if (monthFeeData?.amount) { totalFee += Number(monthFeeData.amount); if (monthFeeData.paid) collectedFee += Number(monthFeeData.amount);}
            const admissionDate = student.admissionDate?.toDate?.();
            if (admissionDate && admissionDate.getMonth() === monthIndex && admissionDate.getFullYear() === currentYear) {
                const additionalFee = studentFees.Additional;
                if (additionalFee?.amount) { totalFee += Number(additionalFee.amount); if (additionalFee.paid) collectedFee += Number(additionalFee.amount);}
            }
        }
    });

    // ----- Staff Salaries -----
    staffList.forEach(staff => {
        // Access salaries for the *selected year*
        const salaries = staff.salaries?.[currentYear] || {};
        if (isAllMonths) { /* ... Original Logic ... */
            totalSalaries += Object.values(salaries).reduce((sum, s) => sum + Number(s.amount || 0), 0);
            salariesPaid += Object.values(salaries).filter(s => s.paid).reduce((sum, s) => sum + Number(s.amount || 0), 0);
        } else { /* ... Original Logic ... */
            const monthSalary = salaries[monthFilter];
            if (monthSalary?.amount) { totalSalaries += Number(monthSalary.amount); if (monthSalary.paid) salariesPaid += Number(monthSalary.amount);}
        }
    });

    // ----- Expenses (FILTERING UPDATED TO USE selectedYear) -----
    const filteredExpenses = expenseList.filter(e => {
        if (!e.date?.toDate) return false;
        const d = e.date.toDate();
        const expenseYear = d.getFullYear();
        const expenseMonth = d.getMonth();
        // Match the selected year
        if (expenseYear !== currentYear) return false;
        // If "All Months", just check year. If a month is selected, check month too.
        return isAllMonths ? true : (expenseMonth === monthIndex);
    });
    const totalExpenses = filteredExpenses.reduce((sum, e) => sum + Number(e.cost || 0), 0);

    const netProfit = collectedFee - salariesPaid - totalExpenses;

    // ----- NEW: Student & Staff Stats -----
    const enrolledStudents = studentList.filter(s => s.status === 'active').length;
    const leftStudentsList = studentList.filter(s => s.status === 'left');
    const activeStaff = staffList.filter(s => s.status === 'active').length;
    const leftStaffList = staffList.filter(s => s.status === 'left');

    return {
      totalFee, collectedFee, totalSalaries, salariesPaid, totalExpenses, netProfit, filteredExpenses,
      // NEW stats
      enrolledStudents, leftStudentsList, activeStaff, leftStaffList,
    };
  }, [studentList, staffList, expenseList, monthFilter, selectedYear]); // Added selectedYear dependency


  // -----------------------------
  // Event Handlers
  // -----------------------------
  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (!newExpense.description.trim() || !newExpense.cost || Number(newExpense.cost) <= 0 || !newExpense.month) {
        toast.warn("Please fill all fields: Description, Cost, and Month.");
        return;
    }
    setIsSaving(true);

    // Use the selectedYear from state
    const currentYear = selectedYear;
    const monthIndex = MONTHS.indexOf(newExpense.month);
    const expenseDate = new Date(currentYear, monthIndex, 15); // Use 15th to avoid timezone issues

    try {
        await addDoc(collection(db, 'expenses'), {
            description: newExpense.description.trim(),
            cost: Number(newExpense.cost),
            date: Timestamp.fromDate(expenseDate),
        });
        toast.success("Expense added successfully!");
        setNewExpense({ description: '', cost: '', month: '' }); // Reset form
        // No need to close modal as it's inline now
    } catch (err) {
        console.error("Error adding expense:", err);
        toast.error("Failed to add expense.");
    } finally {
        setIsSaving(false);
    }
  };

  const handleDeleteExpense = async () => {
    if (!expenseToDelete) return;
    setIsDeleting(true);
    try {
        await deleteDoc(doc(db, 'expenses', expenseToDelete.id));
        toast.success("Expense deleted successfully!");
        setExpenseToDelete(null);
    } catch (err) {
        console.error("Error deleting expense:", err);
        toast.error("Failed to delete expense.");
    } finally {
        setIsDeleting(false);
    }
  }

  // NEW: Handler to open the list modal
  const openListModal = (title, list) => {
    setListModalData({ isOpen: true, title, list });
  };

  // NEW: Handler to clear all filters
  const clearAllFilters = () => {
    setMonthFilter('all');
    setSelectedYear(CURRENT_YEAR);
  }

  return (
    <div className="p-4 md:p-8 bg-gradient-to-br from-gray-50 to-indigo-50 min-h-screen font-sans">
      <ToastContainer position="top-right" autoClose={3000} hideProgressBar={false} />
      <LeftListModal
        isOpen={listModalData.isOpen}
        onClose={() => setListModalData({ isOpen: false, title: '', list: [] })}
        title={listModalData.title}
        list={listModalData.list}
      />

      {/* -- Header Section -- */}
      <header className="flex flex-col md:flex-row justify-between md:items-center mb-8 gap-4">
        <h1 className="text-3xl md:text-4xl font-bold text-gray-800">Dashboard Overview</h1>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 p-3 bg-white rounded-xl shadow-sm border border-gray-200">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="w-full sm:w-32 px-4 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500 transition-shadow"
            >
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="w-full sm:w-48 px-4 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500 transition-shadow"
            >
              <option value="all">Overall ({selectedYear})</option>
              {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            {(monthFilter !== 'all' || selectedYear !== CURRENT_YEAR) && (
                <button onClick={clearAllFilters} className="p-2.5 text-gray-500 bg-gray-100 hover:bg-red-100 hover:text-red-600 rounded-lg transition-colors" title="Clear Filters">
                  <FaTimes className="w-5 h-5"/>
                </button>
            )}
        </div>
      </header>

      {/* -- Loading State -- */}
      {loading ? (
        <div className="flex flex-col justify-center items-center py-20 bg-white rounded-2xl shadow-lg">
          <Loader size="w-12 h-12" color="text-indigo-500"/>
          <p className="mt-4 text-lg text-gray-600 animate-pulse">Loading Dashboard Data...</p>
        </div>
      ) : (
        <>
          {/* -- Student & Staff Stats Section -- */}
          <section className="mb-8">
             <h2 className="text-xl font-semibold text-gray-700 mb-4 ml-1">Student & Staff Summary</h2>
             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard title="Enrolled Students" value={dashboardStats.enrolledStudents} icon={<FaUserGraduate />} color="bg-gradient-to-br from-cyan-500 to-cyan-700" />
                <StatCard title="Left Students" value={dashboardStats.leftStudentsList.length} icon={<FaUserSlash />} color="bg-gradient-to-br from-red-500 to-red-700" onClick={() => openListModal('Left Students', dashboardStats.leftStudentsList)} />
                <StatCard title="Active Staff" value={dashboardStats.activeStaff} icon={<FaUsers />} color="bg-gradient-to-br from-teal-500 to-teal-700" />
                <StatCard title="Left Staff" value={dashboardStats.leftStaffList.length} icon={<FaUserMinus />} color="bg-gradient-to-br from-pink-500 to-pink-700" onClick={() => openListModal('Left Staff', dashboardStats.leftStaffList)} />
             </div>
          </section>

          {/* -- Financial Stats Section -- */}
          <section className="mb-10">
              <h2 className="text-xl font-semibold text-gray-700 mb-4 ml-1">Financial Summary ({monthFilter === 'all' ? selectedYear : `${monthFilter}, ${selectedYear}`})</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <StatCard title="Collected Fee" value={`Rs. ${dashboardStats.collectedFee.toLocaleString()}`} icon={<FaCheckCircle />} color="bg-gradient-to-br from-green-500 to-green-700" />
                <StatCard title="Salaries Paid" value={`Rs. ${dashboardStats.salariesPaid.toLocaleString()}`} icon={<FaMoneyBillWave />} color="bg-gradient-to-br from-yellow-500 to-yellow-700" />
                <StatCard title="Total Expenses" value={`Rs. ${dashboardStats.totalExpenses.toLocaleString()}`} icon={<FaReceipt />} color="bg-gradient-to-br from-orange-500 to-orange-700" />
                <StatCard title="Total Fee (Expected)" value={`Rs. ${dashboardStats.totalFee.toLocaleString()}`} icon={<FaDollarSign />} color="bg-gradient-to-br from-sky-500 to-sky-700" />
                <StatCard title="Total Salaries (Due)" value={`Rs. ${dashboardStats.totalSalaries.toLocaleString()}`} icon={<FaMoneyBillWave />} color="bg-gradient-to-br from-purple-500 to-purple-700" />
                <StatCard title="Net Profit / Loss" value={`Rs. ${dashboardStats.netProfit.toLocaleString()}`} icon={<FaChartLine />} color={dashboardStats.netProfit >= 0 ? "bg-gradient-to-br from-blue-600 to-blue-800" : "bg-gradient-to-br from-red-600 to-red-800"} />
              </div>
          </section>

          {/* -- Expenses List & Add Expense Form Section -- */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Expense List */}
              <div className="lg:col-span-2 bg-white shadow-xl rounded-2xl overflow-hidden flex flex-col">
                <header className="p-4 sm:p-6 border-b">
                  <h2 className="text-xl font-bold text-gray-700">Expense Log ({monthFilter === 'all' ? selectedYear : `${monthFilter}, ${selectedYear}`})</h2>
                </header>
                <div className="overflow-x-auto flex-grow">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-100 sticky top-0">
                      <tr>
                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Description</th>
                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Cost</th>
                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Date</th>
                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {dashboardStats.filteredExpenses.length > 0 ? (
                        dashboardStats.filteredExpenses.map(exp => (
                        <tr key={exp.id} className="hover:bg-indigo-50 transition-colors duration-150">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-800">{exp.description}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 font-semibold">Rs. {Number(exp.cost).toLocaleString()}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(exp.date)}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <button onClick={() => setExpenseToDelete(exp)} className="p-2 text-gray-400 hover:text-red-600 rounded-md transition-colors" title="Delete Expense"><FaTrash className="w-4 h-4"/></button>
                          </td>
                        </tr>
                        ))
                      ) : (
                        <tr><td colSpan="4" className="text-center py-10 text-gray-500 italic">No expenses found for this period.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                 {/* Footer can be added here if needed, e.g., total expense for the period */}
                <footer className="p-4 bg-gray-50 border-t text-right">
                    <span className="text-sm font-medium text-gray-700">Total Expenses for Period: </span>
                    <span className="text-lg font-bold text-red-600">Rs. {dashboardStats.totalExpenses.toLocaleString()}</span>
                </footer>
              </div>

              {/* Add Expense Form (Inline) */}
              <div className="bg-white shadow-xl rounded-2xl p-6 h-fit sticky top-8">
                   <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center">
                       <FaFileInvoiceDollar className="mr-3 text-indigo-500"/> Add New Expense
                   </h2>
                   <form onSubmit={handleAddExpense}>
                    <div className="space-y-5">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                            <div className="relative">
                              <FaReceipt className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-gray-400" />
                              <input type="text" placeholder="e.g., Utility Bill" value={newExpense.description} onChange={e => setNewExpense({...newExpense, description: e.target.value})} className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow" required />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Cost (Rs.)</label>
                            <div className="relative">
                              <FaDollarSign className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-gray-400" />
                              <input type="number" placeholder="e.g., 5000" value={newExpense.cost} onChange={e => setNewExpense({...newExpense, cost: e.target.value})} className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow" required />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Month of Expense</label>
                            <div className="relative">
                                <FaCalendarAlt className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-gray-400" />
                                <select value={newExpense.month} onChange={e => setNewExpense({...newExpense, month: e.target.value})} className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg appearance-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow" required>
                                    <option value="" disabled>Select a month...</option>
                                    {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                            </div>
                            <p className="text-xs text-gray-500 mt-1 italic">Note: Expense will be recorded for {selectedYear}.</p>
                        </div>
                    </div>
                    <div className="mt-8">
                        <button type="submit" disabled={isSaving} className="w-full px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg flex items-center justify-center hover:bg-indigo-700 disabled:bg-indigo-400 transition-colors shadow-md hover:shadow-lg">
                            {isSaving ? <Loader color="text-white"/> : <><FaSave className="mr-2"/> Add Expense Record</>}
                        </button>
                    </div>
                </form>
              </div>
          </section>
        </>
      )}

      {/* Delete Expense Modal */}
      {expenseToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4 transition-opacity duration-300">
            <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md transform transition-all scale-100 opacity-100">
                <h2 className="text-2xl font-bold mb-4 text-gray-800">Confirm Deletion</h2>
                <p className="text-gray-600 mb-6">Are you sure you want to permanently delete the expense: <span className="font-semibold text-red-600">{expenseToDelete.description}</span>?</p>
                <div className="flex justify-end gap-4 mt-8">
                    <button onClick={() => setExpenseToDelete(null)} className="px-6 py-3 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition-colors">Cancel</button>
                    <button onClick={handleDeleteExpense} disabled={isDeleting} className="px-6 py-3 bg-red-600 text-white font-semibold rounded-lg min-w-[120px] flex items-center justify-center hover:bg-red-700 disabled:bg-red-400 transition-colors">
                         {isDeleting ? <Loader color="text-white"/> : <><FaTrash className="mr-2"/> Delete</>}
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default DashboardPage;
