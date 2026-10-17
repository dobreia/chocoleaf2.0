import {
  BrowserRouter,
  Route,
  Routes,
  Navigate,
  useParams,
} from "react-router-dom";

import Layout from "./components/Layout";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import ScrollToTop from "./components/ScrollToTop";
import AboutPage from "./pages/AboutPage";
import AdminShell from "./components/admin/AdminShell";
import Dashboard from "./pages/admin/Dashboard";
import Bookings from "./pages/admin/Bookings";
import CalendarSync from "./pages/admin/CalendarSync";
import Calendar from "./pages/admin/Calendar";
import Services from "./pages/admin/Services";
import Slots from "./pages/admin/Slots";
import Records from "./pages/admin/Records";
import GiftOrders from "./pages/admin/GiftOrders";
import ManageBooking from "./pages/ManageBooking";
import InquiryPage from "./pages/InquiryPage";
import ContentPage from "./pages/legal/ContentPage";
import BookingCalendarPage from "./pages/BookingCalendarPage";
import CourseDetailsPage from "./pages/CourseDetailsPage";
import CoursesPage from "./pages/CoursesPage";
import GalleryPage from "./pages/GalleryPage";
import GiftCardPage from "./pages/GiftCardPage";
import HomePage from "./pages/HomePage";
import NotFoundPage from "./pages/NotFoundPage";
import TransferPage from "./pages/TransferPage";
import PaymentPage from './pages/PaymentPage';
import Payments from './pages/admin/Payments';

function BookingRoute() {
  const { id } = useParams();
  return <BookingCalendarPage key={id} />;
}

function CourseRoute() {
  const { id } = useParams();
  return <CourseDetailsPage key={id} />;
}

function App() {
  const giftCardRoute = (
    <>
      <Navbar />
      <main className="site-main">
        <GiftCardPage />
      </main>
      <Footer />
    </>
  );

  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/giftcard" element={giftCardRoute} />
        <Route path="/giftcards" element={giftCardRoute} />

        <Route element={<Layout />}>
          <Route path="/payment" element={<PaymentPage />} />
          <Route path="/booking/manage" element={<ManageBooking />} />
          <Route path="/courses" element={<CoursesPage />} />
          <Route path="/courses/:id" element={<CourseRoute />} />
          <Route path="/courses/:id/book" element={<BookingRoute />} />
          <Route path="/gallery" element={<GalleryPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<InquiryPage key="contact" />} />
          <Route path="/quote-request" element={<InquiryPage key="quote" quote />} />
          <Route
            path="/legal/imprint"
            element={
              <ContentPage key="imprint" slug="imprint" title="Impresszum" />
            }
          />
          <Route
            path="/legal/privacy"
            element={
              <ContentPage
                key="privacy"
                slug="privacy"
                title="Adatkezelési tájékoztató"
              />
            }
          />
          <Route
            path="/legal/terms"
            element={
              <ContentPage
                key="terms"
                slug="terms"
                title="Rendelési feltételek"
              />
            }
          />
          <Route
            path="/legal/cookies"
            element={<ContentPage key="cookies" slug="cookies" title="Sütik" />}
          />
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        <Route path="/transfer" element={<TransferPage />} />
        <Route path="/transfer.html" element={<TransferPage />} />
        <Route path="/admin" element={<AdminShell />}>
          <Route index element={<Dashboard />} />
          <Route path="login" element={<Navigate to="/admin" replace />} />
          <Route path="bookings" element={<Bookings />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="calendar-sync" element={<CalendarSync />} />
          <Route path="services" element={<Services />} />
          <Route path="courses" element={<Slots />} />
          <Route path="courses/:id" element={<Slots />} />
          <Route
            path="customers"
            element={<Records key="customers" kind="customers" />}
          />
          <Route
            path="inquiries"
            element={<Records key="inquiries" kind="inquiries" />}
          />
          <Route
            path="content"
            element={<Records key="content" kind="content" />}
          />
          <Route path="giftcards" element={<GiftOrders />} />
          <Route path="payments" element={<Payments />} />
        </Route>
        {Object.entries({
          "/idopont": "/courses",
          "/privacy-policy": "/legal/privacy",
          "/impressum": "/legal/imprint",
          "/rendelesi-feltetelek": "/legal/terms",
          "/cookie-policy": "/legal/cookies",
        }).map(([from, to]) => (
          <Route
            key={from}
            path={from}
            element={<Navigate to={to} replace />}
          />
        ))}
      </Routes>
    </BrowserRouter>
  );
}

export default App;
