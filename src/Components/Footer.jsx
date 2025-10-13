import React from 'react';

const Footer = () => {
    return (
        <footer className="bg-white border-t border-gray-200">
            <div className="px-4 py-8 mx-auto max-w-7xl sm:px-6 lg:px-8">
                <div className="md:flex md:items-center md:justify-between">
                    {/* Left Side: Logo and Copyright */}
                    <div className="flex items-center justify-center md:justify-start">
                        <img 
                            className="w-auto h-10" 
                            src="https://savvyschool.edu.pk/wp-content/uploads/2022/05/savvy.png" 
                            alt="Savvy School Logo" 
                        />
                        <div className="ml-4 text-center md:text-left">
                            <p className="text-sm font-semibold text-gray-800">Savvy School Management</p>
                            <p className="mt-1 text-sm text-gray-500">
                                &copy; {new Date().getFullYear()} All rights reserved.
                            </p>
                        </div>
                    </div>
                    
                    {/* Right Side: Navigation Links */}
                    <div className="flex justify-center mt-6 space-x-6 md:mt-0">
                        <a href="#" className="text-sm text-gray-500 hover:text-gray-900">
                            Privacy Policy
                        </a>
                        <a href="#" className="text-sm text-gray-500 hover:text-gray-900">
                            Terms of Service
                        </a>
                        <a href="#" className="text-sm text-gray-500 hover:text-gray-900">
                            Contact Us
                        </a>
                    </div>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
