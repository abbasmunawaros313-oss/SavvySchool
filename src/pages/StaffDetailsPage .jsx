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
  FaFileInvoiceDollar, // New Icon for Deductions
  FaUserPlus,
  FaEdit,
  FaTrash,
  FaSearch,
  FaFilter,
  FaTimes,
  FaCheck,
  FaSave,
  FaSpinner
} from 'react-icons/fa';

// -----------------------------
// Constants & Initializers
// -----------------------------
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// MODIFIED: Added 'deduction' field to the initial salary structure
const createInitialSalaries = (monthlySalary) => {
  const s = {};
  MONTHS.forEach(m => s[m] = { amount: Number(monthlySalary) || 0, paid: false, deduction: 0 });
  return s;
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
  const [salaryFilter, setSalaryFilter] = useState({ month: 'all', status: 'all' });
  const [showOnlyUnpaid, setShowOnlyUnpaid] = useState(false);

  // Modal & CRUD States
  const [staffToEdit, setStaffToEdit] = useState(null);
  const [isAddOrEditModalOpen, setAddOrEditModalOpen] = useState(false);
  const [staffToDelete, setStaffToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [salaryDetails, setSalaryDetails] = useState({});
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

  // -----------------------------
  // Derived Data & Calculations
  // -----------------------------

  // MODIFIED: Calculations now include deductions and sum individual month amounts
  const staffWithSalarySummary = useMemo(() => {
    return staffList.map(s => {
      const salaries = s.salaries || createInitialSalaries(s.monthlySalary);
      const totalSalary = Object.values(salaries).reduce((sum, m) => sum + Number(m.amount || 0), 0);
      const totalPaid = Object.values(salaries).reduce((sum, m) => sum + (m.paid ? Number(m.amount) : 0), 0);
      const totalDeductions = Object.values(salaries).reduce((sum, m) => sum + Number(m.deduction || 0), 0);
      const balance = totalSalary - totalPaid - totalDeductions;
      return { ...s, salaries, monthlySalary: Number(s.monthlySalary) || 0, totalSalary, totalPaid, totalDeductions, balance };
    });
  }, [staffList]);

  const filteredStaff = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return staffWithSalarySummary
      .filter(s => !showOnlyUnpaid || s.balance > 0)
      .filter(s => {
        if (salaryFilter.month === 'all') return true;
        const monthSalary = s.salaries?.[salaryFilter.month];
        if (!monthSalary || Number(monthSalary.amount) <= 0) return salaryFilter.status === 'unpaid';
        if (salaryFilter.status === 'all') return true;
        return salaryFilter.status === 'paid' ? !!monthSalary.paid : !monthSalary.paid;
      })
      .filter(s => !term || s.name?.toLowerCase().includes(term));
  }, [staffWithSalarySummary, searchTerm, salaryFilter, showOnlyUnpaid]);

  // NEW: Global stats are now dynamic based on the month filter
  const displayStats = useMemo(() => {
    const month = salaryFilter.month;
    const isAllMonths = month === 'all';
    
    let totalSalary = 0;
    let totalGiven = 0;
    let totalDeductions = 0;

    staffWithSalarySummary.forEach(staff => {
      if (isAllMonths) {
        totalSalary += staff.totalSalary;
        totalGiven += staff.totalPaid;
        totalDeductions += staff.totalDeductions;
      } else {
        const monthData = staff.salaries?.[month];
        if (monthData) {
          totalSalary += Number(monthData.amount || 0);
          totalGiven += monthData.paid ? Number(monthData.amount || 0) : 0;
          totalDeductions += Number(monthData.deduction || 0);
        }
      }
    });
    
    const totalRemaining = totalSalary - totalGiven - totalDeductions;

    return {
      totalSalary,
      totalGiven,
      totalRemaining,
      totalDeductions,
      cardTitleSuffix: isAllMonths ? '(Annual)' : `(${month})`
    };
  }, [staffWithSalarySummary, salaryFilter.month]);

  // -----------------------------
  // Event Handlers & Modal Functions
  // -----------------------------
  const clearAllFilters = () => {
    setSearchTerm('');
    setSalaryFilter({ month: 'all', status: 'all' });
    setShowOnlyUnpaid(false);
  };

  const handleSaveStaff = async (e) => {
    e.preventDefault();
    if (!selectedStaff?.name?.trim() || !selectedStaff?.monthlySalary || Number(selectedStaff.monthlySalary) < 0) {
      toast.warn('Please fill a valid Name and Monthly Salary.');
      return;
    }

    setIsSaving(true);
    const newMonthlySalary = Number(selectedStaff.monthlySalary);
    
    // Preserve existing paid status and deductions when base salary changes
    const newSalaries = {};
    const originalSalaries = staffToEdit?.salaries || {};
    MONTHS.forEach(month => {
      newSalaries[month] = {
        amount: newMonthlySalary,
        paid: originalSalaries[month]?.paid || false,
        deduction: originalSalaries[month]?.deduction || 0,
      };
    });

    const data = {
      name: selectedStaff.name.trim(),
      monthlySalary: newMonthlySalary,
      salaries: newSalaries,
    };

    try {
      if (staffToEdit) {
        await updateDoc(doc(db, 'staff_details', staffToEdit.id), data);
        toast.success('Staff updated successfully!');
      } else {
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

  const handleSaveSalaryDetails = async () => {
    if (!selectedStaff) return;
    setIsSavingSalary(true);
    try {
      await updateDoc(doc(db, 'staff_details', selectedStaff.id), { salaries: salaryDetails });
      toast.success('Salary details updated successfully!');
      setSelectedStaff(null);
    } catch (err) {
      console.error(err);
      toast.error('Failed to update salary details.');
    } finally {
      setIsSavingSalary(false);
    }
  };

  const openAddModal = () => {
    setStaffToEdit(null);
    setSelectedStaff({ name: '', monthlySalary: '' });
    setAddOrEditModalOpen(true);
  };

  const openEditModal = (staff) => {
    setStaffToEdit(staff);
    setSelectedStaff({ ...staff });
    setAddOrEditModalOpen(true);
  };

  const openSalaryModal = (staff) => {
    setSelectedStaff(staff);
    setSalaryDetails(JSON.parse(JSON.stringify(staff.salaries || createInitialSalaries(staff.monthlySalary || 0))));
  };

  const handleTogglePaid = (month) => {
    setSalaryDetails(prev => ({
      ...prev,
      [month]: { ...prev[month], paid: !prev[month]?.paid }
    }));
  };

  // MODIFIED: Salary modal summary now includes deductions
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

      {/* MODIFIED: Statistics Cards are now dynamic */}
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
      {/* ... (Filter section remains the same) ... */}
      <section className="mb-6 p-4 bg-white rounded-xl shadow-md">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 items-end">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Search Staff</label>
            <div className="relative">
              <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Search by name..." className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
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
          <button onClick={openAddModal} className="flex items-center justify-center px-4 py-2.5 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 transition transform hover:scale-105" >
            <FaUserPlus className="h-5 w-5 mr-2" /> Add Staff
          </button>
        </div>
        {(searchTerm || salaryFilter.month !== 'all' || showOnlyUnpaid) && (
          <div className="mt-4">
            <button onClick={clearAllFilters} className="flex items-center text-sm px-3 py-1 bg-red-100 text-red-700 font-semibold rounded-full hover:bg-red-200 transition" >
              <FaTimes className="h-4 w-4 mr-1" /> Clear Filters
            </button>
          </div>
        )}
      </section>


      {/* Staff Table */}
      <main className="bg-white shadow-xl rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100">
              <tr>
                {/* MODIFIED: Table headers updated */}
                {["Name", "Total Salary", "Paid", "Deductions", "Balance", "Actions"].map(h => (
                  <th key={h} className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan="6" className="text-center py-12 text-gray-500"><div className="flex justify-center items-center"><Loader size="w-6 h-6" /><span className="ml-2">Loading staff...</span></div></td></tr>
              ) : filteredStaff.length > 0 ? (
                filteredStaff.map(s => (
                  <tr key={s.id} className="hover:bg-indigo-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{s.name}</td>
                    {/* MODIFIED: Table data updated for new calculations */}
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
                <tr><td colSpan="6" className="text-center py-12 text-gray-500">No staff found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </main>

      {/* Add/Edit Staff Modal (No changes here) */}
      {/* ... */}
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Default Monthly Salary</label>
                  <input type="number" placeholder="Enter monthly salary" value={selectedStaff?.monthlySalary || ''} onChange={(e) => setSelectedStaff(s => ({ ...s, monthlySalary: e.target.value }))} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" required />
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

      {/* Delete Confirmation Modal (No changes here) */}
      {/* ... */}
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
              <h2 className="text-2xl font-bold">Salary Details: {selectedStaff.name}</h2>
              <p className="text-gray-600">Update monthly salary amounts, deductions, and payment status.</p>
            </header>

            {/* MODIFIED: Added deduction input for each month */}
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
                      <input type="number" value={salaryDetails[month]?.amount || ''} onChange={(e) => setSalaryDetails(p => ({...p, [month]: { ...p[month], amount: Number(e.target.value) }}))} className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"/>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-600">Deduction:</label>
                      <input type="number" value={salaryDetails[month]?.deduction || ''} onChange={(e) => setSalaryDetails(p => ({ ...p, [month]: { ...p[month], deduction: Number(e.target.value) }}))} className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent"/>
                    </div>
                  </div>
                </div>
              ))}
            </section>

            {/* MODIFIED: Footer summary updated with new calculations */}
            <footer className="mt-6 pt-4 border-t flex-shrink-0">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center mb-6">
                <div><h4 className="text-sm text-gray-600">Total Salary</h4><p className="text-2xl font-bold">Rs. {salaryModalSummary.totalSalary.toLocaleString()}</p></div>
                <div><h4 className="text-sm text-gray-600">Total Paid</h4><p className="text-2xl font-bold text-green-600">Rs. {salaryModalSummary.totalPaid.toLocaleString()}</p></div>
                <div><h4 className="text-sm text-gray-600">Deductions</h4><p className="text-2xl font-bold text-yellow-700">Rs. {salaryModalSummary.totalDeductions.toLocaleString()}</p></div>
                <div><h4 className="text-sm text-gray-600">Balance</h4><p className={`text-2xl font-bold ${salaryModalSummary.balance > 0 ? 'text-red-600' : 'text-gray-800'}`}>Rs. {salaryModalSummary.balance.toLocaleString()}</p></div>
              </div>
              <div className="flex justify-end gap-4">
                <button onClick={() => setSelectedStaff(null)} className="px-6 py-3 bg-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-300 transition">Close</button>
                <button onClick={handleSaveSalaryDetails} disabled={isSavingSalary} className="px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:bg-green-400 flex items-center justify-center min-w-[150px] transition">
                  {isSavingSalary ? <><Loader className="mr-2" /> Saving...</> : <><FaSave className="mr-2" /> Save Changes</>}
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};

export default StaffDetailsPage;