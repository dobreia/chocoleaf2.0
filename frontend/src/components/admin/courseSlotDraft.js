export function newCourseDraft(day) {
  const start_time = day ? `${day}T10:00` : '';
  return {
    service_id: '', start_time, end_time: '',
    sessions: [{ start_time, end_time: '' }],
    active: true, price: 0, capacity: 6,
  };
}

