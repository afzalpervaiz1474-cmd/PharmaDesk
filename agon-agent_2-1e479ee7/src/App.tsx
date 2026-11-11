import { HashRouter, Route, Routes } from 'react-router-dom';
import { RuntimeProvider } from './app/RuntimeProvider';
import { AppShell } from './components/layout/AppShell';
import { AssistantPage } from './features/assistant/AssistantPage';
import { CloudSessionProvider } from './features/cloud/CloudSessionProvider';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { InventoryPage } from './features/inventory/InventoryPage';
import { MedicineFormPage } from './features/inventory/MedicineFormPage';
import { NotFoundPage, PlannedPage } from './features/planned/PlannedPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { PreferencesProvider } from './lib/PreferencesProvider';

/**
 * HashRouter is used on purpose: it works unchanged inside the Tauri webview
 * (custom protocol, no server to rewrite deep links) and on static hosting.
 */
export default function App() {
  return (
    <PreferencesProvider>
      <RuntimeProvider>
        <CloudSessionProvider>
          <HashRouter>
            <Routes>
              <Route element={<AppShell />}>
                <Route index element={<DashboardPage />} />
                <Route path="inventory" element={<InventoryPage />} />
                <Route path="inventory/new" element={<MedicineFormPage />} />
                <Route path="inventory/:medicineId/edit" element={<MedicineFormPage />} />
                <Route path="assistant" element={<AssistantPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="planned/:moduleId" element={<PlannedPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </HashRouter>
        </CloudSessionProvider>
      </RuntimeProvider>
    </PreferencesProvider>
  );
}
