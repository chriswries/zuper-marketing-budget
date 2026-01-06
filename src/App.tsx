import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { RequestsProvider } from "@/contexts/RequestsContext";
import { FiscalYearBudgetProvider } from "@/contexts/FiscalYearBudgetContext";
import { AdminSettingsProvider } from "@/contexts/AdminSettingsContext";
import { CurrentUserRoleProvider } from "@/contexts/CurrentUserRoleContext";
import Budget from "./pages/Budget";
import Forecast from "./pages/Forecast";
import Actuals from "./pages/Actuals";
import Requests from "./pages/Requests";
import RequestDetail from "./pages/RequestDetail";
import Reports from "./pages/Reports";
import Tasks from "./pages/Tasks";
import Import from "./pages/Import";
import Admin from "./pages/Admin";
import ApprovalAudit from "./pages/ApprovalAudit";
import VarianceReport from "./pages/VarianceReport";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AdminSettingsProvider>
        <CurrentUserRoleProvider>
          <FiscalYearBudgetProvider>
            <RequestsProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <AppLayout>
                  <Routes>
                    <Route path="/" element={<Navigate to="/budget" replace />} />
                    <Route path="/budget" element={<Budget />} />
                    <Route path="/forecast" element={<Forecast />} />
                    <Route path="/actuals" element={<Actuals />} />
                    <Route path="/requests" element={<Requests />} />
                    <Route path="/requests/:id" element={<RequestDetail />} />
                    <Route path="/reports" element={<Reports />} />
                    <Route path="/tasks" element={<Tasks />} />
                    <Route path="/import" element={<Import />} />
                    <Route path="/admin" element={<Admin />} />
                    <Route path="/audit" element={<ApprovalAudit />} />
                    <Route path="/reports/variance" element={<VarianceReport />} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </AppLayout>
              </BrowserRouter>
            </RequestsProvider>
          </FiscalYearBudgetProvider>
        </CurrentUserRoleProvider>
      </AdminSettingsProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
