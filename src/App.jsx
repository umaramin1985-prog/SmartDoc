import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { SmartSidebar } from './components/SmartSidebar';
import { SmartDashboard } from './components/SmartDashboard';
import { FormsHub } from './components/FormsHub';
import { FormApprovals } from './components/FormApprovals';
import { ReviewsHub } from './components/ReviewsHub';
import { DepartmentMessaging } from './components/DepartmentMessaging';
import { ActivityHub } from './components/ActivityHub';
import { SmartSettingsAdmin } from './components/SmartSettingsAdmin';
import { ProfileAndSignatureModal } from './components/ProfileAndSignatureModal';
import { DocumentPreviewModal } from './components/DocumentPreviewModal';
import { ToastContainer } from './components/ToastContainer';
import { Login } from './components/Login';
import { AppFooter } from './components/AppFooter';
import './App.css';

const MainLayout = () => {
  const { activeTab, isAuthenticated, authLoading, isSuperAdmin, sidebarCollapsed } = useApp();
  const isPopup = typeof window !== 'undefined' && window.location.search.includes('popup=true');

  if (authLoading) {
    return <div className="sd-boot">Loading SmartDoc…</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="smartdoc-auth-layout">
        <Login />
        <ToastContainer />
      </div>
    );
  }

  // Standalone popup window mode (dedicated activity window)
  if (isPopup && activeTab === 'activity') {
    return (
      <div className="smartdoc-standalone-window">
        <ActivityHub isStandalone={true} />
        <ProfileAndSignatureModal />
        <DocumentPreviewModal />
        <ToastContainer />
        <AppFooter />
      </div>
    );
  }

  return (
    <div className={`smartdoc-app-layout ${sidebarCollapsed ? 'sidebar-is-collapsed' : ''}`}>
      <SmartSidebar />
      <main className="smartdoc-main-viewport">
        <div className="smartdoc-main-content">
          {activeTab === 'dashboard' && <SmartDashboard />}
          {activeTab === 'forms' && <FormsHub />}
          {activeTab === 'approvals' && <FormApprovals />}
          {activeTab === 'reviews' && <ReviewsHub />}
          {activeTab === 'dept-messaging' && <DepartmentMessaging />}
          {activeTab === 'activity' && <ActivityHub />}
          {activeTab === 'settings' && isSuperAdmin && <SmartSettingsAdmin />}
        </div>
        <AppFooter />
      </main>
      <ProfileAndSignatureModal />
      <DocumentPreviewModal />
      <ToastContainer />
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <MainLayout />
    </AppProvider>
  );
}
