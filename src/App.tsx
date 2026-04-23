/**
 * RT-SC · App.
 *
 * - Defines every route in the application.
 * - Wraps protected sections with auth and subscription guards.
 * - Lazy-loads each role's dashboard so users only download the bundle they need.
 */

import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'

import { AuthProvider } from '@/components/guards/AuthProvider'
import { SubscriptionGuard } from '@/components/guards/SubscriptionGuard'
import { ProtectedRoute } from '@/components/guards/ProtectedRoute'
import { ToastContainer } from '@/components/ui/ToastContainer'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useSettingsStore, applyFontSize } from '@/stores/settings'

// Eagerly loaded — small public-facing pages
import LandingPage from '@/routes/landing/LandingPage'
import WelcomePage from '@/routes/welcome/WelcomePage'
import AdminLogin from '@/routes/auth/AdminLogin'
import ProfAuth from '@/routes/auth/ProfAuth'
import CaisseAuth from '@/routes/auth/CaisseAuth'
import PersonnelChoice from '@/routes/auth/PersonnelChoice'
import EleveChoice from '@/routes/auth/EleveChoice'
import EleveSignup from '@/routes/auth/EleveSignup'
import EleveLogin from '@/routes/auth/EleveLogin'
import ParentLogin from '@/routes/auth/ParentLogin'
import EnAttentePage from '@/routes/prof/EnAttentePage'
import LockedPage from '@/routes/locked/LockedPage'
import MaintenancePage from '@/routes/maintenance/MaintenancePage'
import InscriptionPage from '@/routes/inscription/InscriptionPage'
import PreviewPage from '@/routes/preview/PreviewPage'
import AboutPage from '@/routes/about/AboutPage'
import CmsAboutEditor from '@/routes/cms/CmsAboutEditor'
import ResetSwPage from '@/routes/reset-sw/ResetSwPage'
import { UidGate } from '@/components/guards/UidGate'

// Lazy-loaded — heavy role dashboards in their own bundle
const AdminDashboard = lazy(() => import('@/routes/admin/AdminDashboard'))
const ProfDashboard = lazy(() => import('@/routes/prof/ProfDashboard'))
const EleveDashboard = lazy(() => import('@/routes/eleve/EleveDashboard'))
const ParentApp = lazy(() => import('@/routes/parent/ParentApp'))
const CaissierDashboard = lazy(() => import('@/routes/caissier/CaissierDashboard'))

function RouteFallback() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-navy">
      <div className="h-2 w-32 bg-white/15 rounded-full overflow-hidden">
        <div className="h-full w-1/3 bg-gold rounded-full animate-pulse" />
      </div>
    </div>
  )
}

export default function App() {
  // Apply persisted font-size to the root element on mount + whenever
  // the user changes it in Settings. Done once at the top level so
  // every route benefits without per-page wiring.
  const fontSize = useSettingsStore((s) => s.fontSize)
  useEffect(() => {
    applyFontSize(fontSize)
  }, [fontSize])

  return (
    <AuthProvider>
      <SubscriptionGuard>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            {/* Service worker / cache kill switch — no guards so it
                works even when auth or subscription state is broken. */}
            <Route path="/reset-sw" element={<ResetSwPage />} />

            {/* Public entry points */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/welcome" element={<WelcomePage />} />

            {/* Auth screens */}
            <Route path="/auth/admin" element={<AdminLogin />} />

            {/* Personnel de l'école — umbrella. Chooser presents
                Professeur vs Caissier. Both paths lead to signup +
                login + forgot-password tabs that stamp the correct
                role at account creation. */}
            <Route path="/auth/personnel" element={<PersonnelChoice />} />
            <Route
              path="/auth/personnel/prof"
              element={<ProfAuth />}
            />
            <Route
              path="/auth/personnel/caisse"
              element={<CaisseAuth />}
            />

            {/* Backward compat — anyone hitting /auth/prof lands on
                the chooser (they almost certainly meant Professeur,
                but showing the chooser educates them on the caissier
                entry point without breaking anything). */}
            <Route path="/auth/prof" element={<PersonnelChoice />} />

            <Route path="/auth/eleve" element={<EleveChoice />} />
            <Route path="/auth/eleve/signup" element={<EleveSignup />} />
            <Route path="/auth/eleve/login" element={<EleveLogin />} />
            <Route path="/auth/parent" element={<ParentLogin />} />

            {/* Public — inscription portal */}
            <Route path="/inscription" element={<InscriptionPage />} />

            {/* Public — À propos page (CMS-driven) */}
            <Route path="/a-propos" element={<AboutPage />} />

            {/* Hidden — À propos CMS editor, UID-gated to the developer */}
            <Route
              path="/__cms/about"
              element={
                <UidGate>
                  <CmsAboutEditor />
                </UidGate>
              }
            />

            {/* Phase 1 — UI components preview (visual smoke test) */}
            <Route path="/preview" element={<PreviewPage />} />

            {/* SaaS lockout pages (no auth required so admin can pay even mid-lock) */}
            <Route path="/locked" element={<LockedPage />} />
            <Route path="/maintenance" element={<MaintenancePage />} />
            {/* Legacy /paiement route — redirects to the unified /locked
                page (Phase 6f consolidated both into one FedaPay inline flow). */}
            <Route path="/paiement" element={<Navigate to="/locked" replace />} />

            {/* Prof "en attente d'approbation" page (rendered before role checks) */}
            <Route path="/prof/en-attente" element={<EnAttentePage />} />

            {/* Admin */}
            <Route
              path="/admin/*"
              element={
                <ProtectedRoute role="admin">
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />

            {/* Prof */}
            <Route
              path="/prof/*"
              element={
                <ProtectedRoute role="prof">
                  <ProfDashboard />
                </ProtectedRoute>
              }
            />

            {/* Élève */}
            <Route
              path="/eleve/*"
              element={
                <ProtectedRoute role="eleve">
                  <EleveDashboard />
                </ProtectedRoute>
              }
            />

            {/* Caissier — dedicated surface for finance + inscriptions.
                The role is exclusive: someone with role='caissier' CAN'T
                also access admin/prof dashboards. */}
            <Route
              path="/caissier/*"
              element={
                <ProtectedRoute role="caissier">
                  <CaissierDashboard />
                </ProtectedRoute>
              }
            />

            {/* Parent — its own app entry, no general role gate (uses parent session) */}
            <Route path="/parent/*" element={<ParentApp />} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>

        {/* Globally-mounted UI services */}
        <ToastContainer />
        <ConfirmDialog />
      </SubscriptionGuard>
    </AuthProvider>
  )
}
