import React from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

const Layout = ({ children, title }) => {
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 text-gray-900">
      <Sidebar />
      <div className="flex flex-col flex-1 w-full overflow-hidden">
        <Topbar title={title} />
        <main className="flex-1 overflow-x-hidden overflow-y-auto p-8 bg-gray-50">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
