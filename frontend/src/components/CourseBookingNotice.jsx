import {courseBookingNotice} from './courseNoticeContent.js';
import '../styles/CourseBookingNotice.css';

export default function CourseBookingNotice({service, offers}) {
  const notice=courseBookingNotice(service,offers);
  return notice && <div className="course-booking-notice">
    <strong>{notice.title}</strong>
    <p>{notice.description}</p>
  </div>;
}
