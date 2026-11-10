import React, { useState, useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { SmartSidebar } from './components/SmartSidebar';
import { TopWorkspaceBar, CommandPalette } from './components/CommandPalette';
import { SmartDashboard } from './components/SmartDashboard';
import { SmartDashboardModern } from './components/SmartDashboardModern';
import { FormsHub } from './components/FormsHub';
import { FormApprovals } from './components/FormApprovals';
import { ReviewsHub } from './components/ReviewsHub';
import { DepartmentMessaging } from './components/DepartmentMessaging';
import { ActivityHub } from './components/ActivityHub';
import { SmartSettingsAdmin } from './components/SmartSettingsAdmin';
import { ProfileAndSignatureModal } from './components/ProfileAndSignatureModal';
import { DocumentPreviewModal } from './components/DocumentPreviewModal';
import { WelcomeBriefingModal } from './components/WelcomeBriefingModal';
import { ToastContainer } from './components/ToastContainer';
import { Login } from './components/Login';
import { AppFooter } from './components/AppFooter';
import './App.css';

const MainLayout = () => {
  const { activeTab, isAuthenticated, authLoading, isSuperAdmin, sidebarCollapsed } = useApp();
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const isPopup = typeof window !== 'undefined' && window.location.search.includes('popup=true');

  // Global keyboard shortcut: Ctrl+K or Cmd+K opens SmartDoc Spotlight Command Palette
  // (Ignored when inside contentEditable or Word Form Studio so Ctrl+K Insert Link works natively)
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        if (e.target?.isContentEditable || e.target?.closest?.('[contenteditable="true"], .sws-overlay')) {
          return;
        }
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAuthenticated]);

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
      <SmartSidebar onOpenCommandPalette={() => setIsCommandPaletteOpen(true)} />
      <main className="smartdoc-main-viewport">
        <TopWorkspaceBar onOpenCommandPalette={() => setIsCommandPaletteOpen(true)} />
        <div className="smartdoc-main-content">
          {activeTab === 'dashboard' && <SmartDashboard />}
          {activeTab === 'dashboard-modern' && <SmartDashboardModern />}
          {activeTab === 'forms' && <FormsHub />}
          {activeTab === 'approvals' && <FormApprovals />}
          {activeTab === 'reviews' && <ReviewsHub />}
          {activeTab === 'dept-messaging' && <DepartmentMessaging />}
          {activeTab === 'activity' && <ActivityHub />}
          {activeTab === 'settings' && isSuperAdmin && <SmartSettingsAdmin />}
        </div>
        <AppFooter />
      </main>
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
      />
      <WelcomeBriefingModal />
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
