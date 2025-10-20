import React, { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';

const Navbar = ({ onLogout }) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const navLinks = [
        { name: 'Dashboard', path: '/' },
      
        { name: 'Student Section', path: '/students' },
        { name: 'Staff Section', path: '/staff' },
        { name: 'Fee Slip Generator', path: '/feeslipgen' },
    ];

    return (
        <nav className="bg-white shadow-lg sticky top-0 z-50">
            <div className="px-4 mx-auto max-w-7xl sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    <div className="flex-shrink-0">
                        <img 
                            className="w-auto h-12" 
                            src="https://savvyschool.edu.pk/wp-content/uploads/2022/05/savvy.png" 
                            alt="Savvy School Logo" 
                        />
                    </div>

                    <div className="hidden md:block">
                        <div className="flex items-baseline ml-10 space-x-4">
                            {navLinks.map((link) => (
                                <NavLink
                                    key={link.name}
                                    to={link.path}
                                    className={({ isActive }) => 
                                        `px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                                            isActive ? 'bg-indigo-100 text-indigo-700' : 'text-gray-700 hover:bg-indigo-50 hover:text-indigo-600'
                                        }`
                                    }
                                >
                                    {link.name}
                                </NavLink>
                            ))}
                        </div>
                    </div>

                    <div className="hidden md:block">
                         <button 
                            onClick={onLogout} 
                            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700"
                        >
                            Logout
                        </button>
                    </div>

                    <div className="flex -mr-2 md:hidden">
                        <button 
                            onClick={() => setIsMenuOpen(!isMenuOpen)} 
                            type="button" 
                            className="inline-flex items-center justify-center p-2 text-indigo-500 bg-indigo-50 rounded-md hover:bg-indigo-100"
                        >
                            <span className="sr-only">Open main menu</span>
                            <svg className="block w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                {isMenuOpen ? (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                ) : (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7" />
                                )}
                            </svg>
                        </button>
                    </div>
                </div>
            </div>

            {isMenuOpen && (
                <div className="md:hidden">
                    <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
                        {navLinks.map((link) => (
                             <NavLink
                                key={link.name}
                                to={link.path}
                                onClick={() => setIsMenuOpen(false)}
                                className={({ isActive }) => 
                                    `block px-3 py-2 text-base font-medium rounded-md ${
                                        isActive ? 'bg-indigo-100 text-indigo-700' : 'text-gray-700 hover:bg-indigo-50 hover:text-indigo-600'
                                    }`
                                }
                            >
                                {link.name}
                            </NavLink>
                        ))}
                    </div>
                    <div className="px-2 pt-2 pb-3 border-t border-gray-200">
                         <button 
                            onClick={onLogout} 
                            className="w-full px-4 py-2 text-base font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700"
                        >
                            Logout
                        </button>
                    </div>
                </div>
            )}
        </nav>
    );
};

export default Navbar;
