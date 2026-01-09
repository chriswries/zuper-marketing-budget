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
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { MustChangePasswordGuard } from "@/components/auth/MustChangePasswordGuard";
import Budget from "./pages/Budget";
import Forecast from "./pages/Forecast";
import Actuals from "./pages/Actuals";
import Requests from "./pages/Requests";
import RequestDetail from "./pages/RequestDetail";
import Reports from "./pages/Reports";
import Tasks from "./pages/Tasks";
import Import from "./pages/Import";
import Admin from "./pages/Admin";
import AdminUsers from "./pages/AdminUsers";
import ApprovalAudit from "./pages/ApprovalAudit";
import VarianceReport from "./pages/VarianceReport";
import ForecastActualsVarianceReport from "./pages/ForecastActualsVarianceReport";
import ActualsImport from "./pages/ActualsImport";
import ActualsMatching from "./pages/ActualsMatching";
import FYTools from "./pages/FYTools";
import AdminDataMigration from "./pages/AdminDataMigration";
import Login from "./pages/Login";
import ChangePassword from "./pages/ChangePassword";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BrowserRouter>
        <AuthProvider>
          <AdminSettingsProvider>
            <CurrentUserRoleProvider>
              <FiscalYearBudgetProvider>
                <RequestsProvider>
                  <Toaster />
                  <Sonner />
                  <Routes>
                    {/* Public routes */}
                    <Route path="/login" element={<Login />} />
                    <Route path="/reset-password" element={<ResetPassword />} />

                    {/* Change password (protected but no layout) */}
                    <Route
                      path="/change-password"
                      element={
                        <ProtectedRoute>
                          <ChangePassword />
                        </ProtectedRoute>
                      }
                    />

                    {/* Protected routes with layout */}
                    <Route
                      element={
                        <ProtectedRoute>
                          <MustChangePasswordGuard>
                            <AppLayout />
                          </MustChangePasswordGuard>
                        </ProtectedRoute>
                      }
                    >
                      <Route path="/" element={<Navigate to="/budget" replace />} />
                      <Route path="/budget" element={<Budget />} />
                      <Route path="/forecast" element={<Forecast />} />
                      <Route path="/actuals" element={<Actuals />} />
                      <Route path="/requests" element={<Requests />} />
                      <Route path="/requests/:id" element={<RequestDetail />} />
                      <Route path="/reports" element={<Reports />} />
                      <Route path="/tasks" element={<Tasks />} />
                      <Route path="/import" element={<Import />} />
                      <Route
                        path="/admin"
                        element={
                          <RoleGuard allowedRoles={['admin']}>
                            <Admin />
                          </RoleGuard>
                        }
                      />
                      <Route
                        path="/admin/users"
                        element={
                          <RoleGuard allowedRoles={['admin']}>
                            <AdminUsers />
                          </RoleGuard>
                        }
                      />
                      <Route
                        path="/admin/actuals"
                        element={
                          <RoleGuard allowedRoles={['admin', 'finance']}>
                            <ActualsImport />
                          </RoleGuard>
                        }
                      />
                      <Route
                        path="/admin/actuals/match"
                        element={
                          <RoleGuard allowedRoles={['admin', 'finance']}>
                            <ActualsMatching />
                          </RoleGuard>
                        }
                      />
                      <Route
                        path="/admin/fy-tools"
                        element={
                          <RoleGuard allowedRoles={['admin']}>
                            <FYTools />
                          </RoleGuard>
                        }
                      />
                      <Route
                        path="/admin/data-migration"
                        element={
                          <RoleGuard allowedRoles={['admin']}>
                            <AdminDataMigration />
                          </RoleGuard>
                        }
                      />
                      <Route path="/audit" element={<ApprovalAudit />} />
                      <Route path="/reports/variance" element={<VarianceReport />} />
                      <Route path="/reports/forecast-actuals-variance" element={<ForecastActualsVarianceReport />} />
                      <Route path="*" element={<NotFound />} />
                    </Route>
                  </Routes>
                </RequestsProvider>
              </FiscalYearBudgetProvider>
            </CurrentUserRoleProvider>
          </AdminSettingsProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
