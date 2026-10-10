import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { PublicLayout } from './components/Layout';
import { Spinner } from './components/ui';
import CataloguePage from './pages/Catalogue';
import DownloadPage from './pages/DownloadPage';
import HomePage from './pages/Home';
import NotFound from './pages/NotFound';
import SoftwareDetail from './pages/SoftwareDetail';
import { About, Contact, Privacy, SubmissionPolicy, Takedown, Terms } from './pages/StaticPages';

const AdminApp = lazy(() => import('./admin/AdminApp'));
const pub = (el: React.ReactNode) => <PublicLayout>{el}</PublicLayout>;

export default function App() {
  return (
    <Routes>
      <Route path="/admin/*" element={<Suspense fallback={<Spinner />}><AdminApp /></Suspense>} />
      <Route path="/" element={pub(<HomePage />)} />
      <Route path="/catalogue" element={pub(<CataloguePage />)} />
      <Route path="/software/:slug" element={pub(<SoftwareDetail />)} />
      <Route path="/download/:fileId" element={pub(<DownloadPage />)} />
      <Route path="/about" element={pub(<About />)} />
      <Route path="/contact" element={pub(<Contact />)} />
      <Route path="/privacy" element={pub(<Privacy />)} />
      <Route path="/terms" element={pub(<Terms />)} />
      <Route path="/submission-policy" element={pub(<SubmissionPolicy />)} />
      <Route path="/takedown" element={pub(<Takedown />)} />
      <Route path="*" element={pub(<NotFound />)} />
    </Routes>
  );
}
