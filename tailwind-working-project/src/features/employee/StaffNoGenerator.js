// Utility to auto-generate next staff number
export function getNextStaffNo(employees) {
  if (!employees || employees.length === 0) return "1001";
  const maxNo = Math.max(...employees.map(e => parseInt(e.staff_no, 10) || 1000));
  return String(maxNo + 1);
}
