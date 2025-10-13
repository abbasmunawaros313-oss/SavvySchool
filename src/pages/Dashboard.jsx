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
} from 'react-icons/fa';

// -----------------------------
// Constants
// -----------------------------
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// -----------------------------
// Reusable UI Components
// -----------------------------
const StatCard = ({ title, value, icon, color }) => (
  <div className={`relative p-5 rounded-2xl shadow-lg overflow-hidden ${color}`}>
    <div className="relative z-10">
      <h3 className="text-base font-semibold text-white text-opacity-90 truncate">{title}</h3>
      <p className="text-3xl font-bold mt-2 text-white">{value}</p>
    </div>
    <div className="absolute -bottom-4 -right-4 opacity-20 text-white text-7xl">{icon}</div>
  </div>
);

const Loader = ({ size = 'w-5 h-5' }) => <FaSpinner className={`animate-spin ${size}`} />;

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

  // Modal & CRUD States
  const [isExpenseModalOpen, setExpenseModalOpen] = useState(false);
  // MODIFIED: State for new expense now includes a month
  const [newExpense, setNewExpense] = useState({ description: '', cost: '', month: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // -----------------------------
  // Firebase Data Fetching
  // -----------------------------
  useEffect(() => {
    setLoading(true);
    const unsubStaff = onSnapshot(collection(db, 'staff_details'), (snap) => {
      setStaffList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubStudents = onSnapshot(collection(db, 'students_details'), (snap) => {
      setStudentList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubExpenses = onSnapshot(collection(db, 'expenses'), (snap) => {
      setExpenseList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    Promise.all([unsubStaff, unsubStudents, unsubExpenses]).then(() => {
        setLoading(false);
    }).catch(err => {
        console.error("Error fetching initial data:", err);
        toast.error("Failed to load dashboard data.");
        setLoading(false);
    });

    return () => {
      unsubStaff();
      unsubStudents();
      unsubExpenses();
    };
  }, []);

  // -----------------------------
  // Derived Data & Calculations
  // -----------------------------
 const dashboardStats = useMemo(() => {
    const isAllMonths = monthFilter === 'all';
    const currentYear = new Date().getFullYear();
    const monthIndex = MONTHS.indexOf(monthFilter);

    let totalFee = 0;
    let collectedFee = 0;
    let totalSalaries = 0;
    let salariesPaid = 0;

    // ----- Students Fees -----
    studentList.forEach(student => {
        const studentFees = student.fees || {};

        if (isAllMonths) {
            // Sum all months
            Object.values(studentFees).forEach(feeData => {
                if (feeData?.amount) {
                    totalFee += Number(feeData.amount);
                    if (feeData.paid) collectedFee += Number(feeData.amount);
                }
            });
        } else {
            // Only the selected month
            const monthFeeData = studentFees[monthFilter];
            if (monthFeeData?.amount) {
                totalFee += Number(monthFeeData.amount);
                if (monthFeeData.paid) collectedFee += Number(monthFeeData.amount);
            }
            // Include "Additional" if admission is in the selected month
            const admissionDate = student.admissionDate?.toDate?.();
            if (admissionDate && admissionDate.getMonth() === monthIndex && admissionDate.getFullYear() === currentYear) {
                const additionalFee = studentFees.Additional;
                if (additionalFee?.amount) {
                    totalFee += Number(additionalFee.amount);
                    if (additionalFee.paid) collectedFee += Number(additionalFee.amount);
                }
            }
        }
    });

    // ----- Staff Salaries -----
    staffList.forEach(staff => {
        const salaries = staff.salaries || {};
        if (isAllMonths) {
            totalSalaries += Object.values(salaries).reduce((sum, s) => sum + Number(s.amount || 0), 0);
            salariesPaid += Object.values(salaries).filter(s => s.paid).reduce((sum, s) => sum + Number(s.amount || 0), 0);
        } else {
            const monthSalary = salaries[monthFilter];
            if (monthSalary?.amount) {
                totalSalaries += Number(monthSalary.amount);
                if (monthSalary.paid) salariesPaid += Number(monthSalary.amount);
            }
        }
    });

    // ----- Expenses -----
    const filteredExpenses = isAllMonths
        ? expenseList
        : expenseList.filter(e => {
            if (!e.date?.toDate) return false;
            const d = e.date.toDate();
            return d.getMonth() === monthIndex && d.getFullYear() === currentYear;
        });
    const totalExpenses = filteredExpenses.reduce((sum, e) => sum + Number(e.cost || 0), 0);

    const netProfit = collectedFee - salariesPaid - totalExpenses;

    return {
        totalFee,
        collectedFee,
        totalSalaries,
        salariesPaid,
        totalExpenses,
        netProfit,
        filteredExpenses
    };
}, [studentList, staffList, expenseList, monthFilter]);


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

    // MODIFIED: Create a date based on the selected month and current year
    const currentYear = new Date().getFullYear();
    const monthIndex = MONTHS.indexOf(newExpense.month);
    // We use the 15th of the month to avoid timezone issues
    const expenseDate = new Date(currentYear, monthIndex, 15);

    try {
        await addDoc(collection(db, 'expenses'), {
            description: newExpense.description.trim(),
            cost: Number(newExpense.cost),
            date: Timestamp.fromDate(expenseDate),
        });
        toast.success("Expense added successfully!");
        setNewExpense({ description: '', cost: '', month: '' });
        setExpenseModalOpen(false);
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

  return (
    <div className="p-4 md:p-8 bg-gray-50 min-h-screen font-sans">
      <ToastContainer position="top-right" autoClose={3000} hideProgressBar={true} />
      
      <header className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 gap-4">
        <h1 className="text-3xl md:text-4xl font-bold text-gray-800">Financial Dashboard</h1>
        <div className="flex items-center gap-2">
            <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className="w-full sm:w-48 px-4 py-2.5 border border-gray-300 rounded-lg shadow-sm">
                <option value="all">Overall (Annual)</option>
                {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            {monthFilter !== 'all' && (
                <button onClick={() => setMonthFilter('all')} className="p-2.5 text-gray-500 hover:text-red-600"><FaTimes/></button>
            )}
        </div>
      </header>
      
      {loading ? (
        <div className="text-center py-12"> <Loader size="w-8 h-8" /> </div>
      ) : (
        <>
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                <StatCard title="Collected Fee" value={`Rs. ${dashboardStats.collectedFee.toLocaleString()}`} icon={<FaCheckCircle />} color="bg-gradient-to-br from-green-500 to-green-600" />
                <StatCard title="Salaries Paid" value={`Rs. ${dashboardStats.salariesPaid.toLocaleString()}`} icon={<FaMoneyBillWave />} color="bg-gradient-to-br from-yellow-500 to-yellow-600" />
                <StatCard title="Total Expenses" value={`Rs. ${dashboardStats.totalExpenses.toLocaleString()}`} icon={<FaReceipt />} color="bg-gradient-to-br from-orange-500 to-orange-600" />
                <StatCard title="Total Fee" value={`Rs. ${dashboardStats.totalFee.toLocaleString()}`} icon={<FaDollarSign />} color="bg-gradient-to-br from-sky-500 to-sky-600" />
                <StatCard title="Total Salaries" value={`Rs. ${dashboardStats.totalSalaries.toLocaleString()}`} icon={<FaMoneyBillWave />} color="bg-gradient-to-br from-purple-500 to-purple-600" />
                <StatCard title="Net Profit / Loss" value={`Rs. ${dashboardStats.netProfit.toLocaleString()}`} icon={<FaChartLine />} color={dashboardStats.netProfit >= 0 ? "bg-gradient-to-br from-blue-500 to-blue-700" : "bg-gradient-to-br from-red-500 to-red-700"} />
            </section>
        
            <section className="bg-white shadow-xl rounded-2xl overflow-hidden">
                <header className="p-4 sm:p-6 border-b flex justify-between items-center">
                    <h2 className="text-xl font-bold text-gray-700">Expenses for {monthFilter === 'all' ? 'the Year' : monthFilter}</h2>
                    <button onClick={() => setExpenseModalOpen(true)} className="flex items-center justify-center px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700">
                        <FaPlus className="h-4 w-4 mr-2" /> Add Expense
                    </button>
                </header>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-100">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase">Description</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase">Cost</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase">Date</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {dashboardStats.filteredExpenses.length > 0 ? (
                                dashboardStats.filteredExpenses.map(exp => (
                                <tr key={exp.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-800">{exp.description}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 font-semibold">Rs. {Number(exp.cost).toLocaleString()}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{exp.date ? exp.date.toDate().toLocaleDateString() : 'N/A'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <button onClick={() => setExpenseToDelete(exp)} className="p-2 text-gray-500 hover:text-red-600"><FaTrash /></button>
                                    </td>
                                </tr>
                                ))
                            ) : (
                                <tr><td colSpan="4" className="text-center py-10 text-gray-500">No expenses recorded for this period.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
        </>
      )}

      {/* MODIFIED: Add Expense Modal now includes month selection */}
      {isExpenseModalOpen && (
         <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
            <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-lg">
                <h2 className="text-2xl font-bold mb-6">Add New Expense</h2>
                <form onSubmit={handleAddExpense}>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                            <input type="text" placeholder="e.g., Office Supplies" value={newExpense.description} onChange={e => setNewExpense({...newExpense, description: e.target.value})} className="w-full px-4 py-3 border border-gray-300 rounded-lg" required />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Cost (Rs.)</label>
                            <input type="number" placeholder="e.g., 5000" value={newExpense.cost} onChange={e => setNewExpense({...newExpense, cost: e.target.value})} className="w-full px-4 py-3 border border-gray-300 rounded-lg" required />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Month of Expense</label>
                            <div className="relative">
                                <FaCalendarAlt className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                                <select value={newExpense.month} onChange={e => setNewExpense({...newExpense, month: e.target.value})} className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg appearance-none" required>
                                    <option value="" disabled>Select a month...</option>
                                    {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>
                    <div className="mt-8 flex justify-end gap-4">
                        <button type="button" onClick={() => setExpenseModalOpen(false)} className="px-6 py-3 bg-gray-200 text-gray-700 font-semibold rounded-lg">Cancel</button>
                        <button type="submit" disabled={isSaving} className="px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg min-w-[120px] flex items-center justify-center">
                            {isSaving ? <Loader /> : <><FaSave className="mr-2"/> Save Expense</>}
                        </button>
                    </div>
                </form>
            </div>
         </div>
      )}

      {/* Delete Expense Modal (No changes here) */}
      {expenseToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
            <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md">
                <h2 className="text-2xl font-bold mb-4">Confirm Deletion</h2>
                <p className="text-gray-600 mb-6">Are you sure you want to delete the expense: <span className="font-semibold">{expenseToDelete.description}</span>?</p>
                <div className="flex justify-end gap-4">
                    <button onClick={() => setExpenseToDelete(null)} className="px-6 py-3 bg-gray-200 font-semibold rounded-lg">Cancel</button>
                    <button onClick={handleDeleteExpense} disabled={isDeleting} className="px-6 py-3 bg-red-600 text-white font-semibold rounded-lg min-w-[120px] flex items-center justify-center">
                         {isDeleting ? <Loader /> : <><FaTrash className="mr-2"/> Delete</>}
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default DashboardPage;