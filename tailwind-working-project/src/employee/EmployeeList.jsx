// src/pages/EmployeeList.jsx
import React, { useEffect, useState } from "react";
import axios from "axios";
// ✅ Import from barrel to avoid path issues
import { EmployeeDetailsModal } from "../components";

const API_BASE = "http://127.0.0.1:8000";

const EmployeeList = () => {
	const [employees, setEmployees] = useState([]);
	const [selectedEmployee, setSelectedEmployee] = useState(null);
	const [showNewModal, setShowNewModal] = useState(false);
	const [loading, setLoading] = useState(false);
	const [err, setErr] = useState("");

  useEffect(() => {
	const run = async () => {
	  setLoading(true);
	  setErr("");
	  try {
		const res = await axios.get(`${API_BASE}/employees/`);
		setEmployees(res.data || []);
	  } catch (e) {
		setErr("Failed to load employees");
		setEmployees([]);
	  } finally {
		setLoading(false);
	  }
	};
	run();
  }, []);

	// Filters and search state
	const [filterType, setFilterType] = useState("");
	const [filterJob, setFilterJob] = useState("");
	const [filterDept, setFilterDept] = useState("");
	const [filterRegion, setFilterRegion] = useState("");
	const [search, setSearch] = useState("");
	const [tab, setTab] = useState("Active");
	const [selected, setSelected] = useState([]);

	// Dummy options for filters (replace with real data if available)
	const types = ["All Types", "regular (open-ended)", "contract", "intern"];
	const jobs = ["All Job Titles", "Managing Director", "Sales Executive", "Accountant"];
	const depts = ["No Department Set", "Sales", "HR", "Finance"];
	const regions = ["All Regions", "Nairobi", "Mombasa", "Kisumu"];

	// Filtered employees
	const filtered = employees.filter(emp => {
		if (tab === "Active" && emp.status === "terminated") return false;
		if (tab === "Terminated" && emp.status !== "terminated") return false;
		if (filterType && filterType !== "All Types" && emp.type !== filterType) return false;
		if (filterJob && filterJob !== "All Job Titles" && emp.job_title !== filterJob) return false;
		if (filterDept && filterDept !== "No Department Set" && emp.department !== filterDept) return false;
		if (filterRegion && filterRegion !== "All Regions" && emp.region !== filterRegion) return false;
		if (search && !Object.values(emp).join(" ").toLowerCase().includes(search.toLowerCase())) return false;
		return true;
	});

	// Bulk select
	const toggleSelect = (staff_no) => {
		setSelected(sel => sel.includes(staff_no) ? sel.filter(s => s !== staff_no) : [...sel, staff_no]);
	};
	const selectAll = () => {
		setSelected(filtered.map(emp => emp.staff_no));
	};
	const deselectAll = () => setSelected([]);

	return (
		<div className="p-2 w-full max-w-[98vw] mx-auto">
					<div className="flex flex-wrap items-center gap-2 mb-2">
						<button
							className="bg-green-600 text-white px-4 py-2 rounded"
							onClick={() => setShowNewModal(true)}
						>
							Add New Employee
						</button>
				<button className="text-blue-700" onClick={() => window.history.back()}>&lt; Back</button>
				<span className="font-semibold">View Employees :</span>
				<select className="border rounded px-2 py-1" value={filterType} onChange={e => setFilterType(e.target.value)}>
					{types.map(t => <option key={t} value={t}>{t}</option>)}
				</select>
				<select className="border rounded px-2 py-1" value={filterJob} onChange={e => setFilterJob(e.target.value)}>
					{jobs.map(j => <option key={j} value={j}>{j}</option>)}
				</select>
				<select className="border rounded px-2 py-1" value={filterDept} onChange={e => setFilterDept(e.target.value)}>
					{depts.map(d => <option key={d} value={d}>{d}</option>)}
				</select>
				<select className="border rounded px-2 py-1" value={filterRegion} onChange={e => setFilterRegion(e.target.value)}>
					{regions.map(r => <option key={r} value={r}>{r}</option>)}
				</select>
				<button className="bg-green-500 text-white px-3 py-1 rounded">Refresh Data</button>
				<input className="border rounded px-2 py-1 ml-2" placeholder="Search" value={search} onChange={e => setSearch(e.target.value)} />
				<button className="bg-blue-600 text-white px-3 py-1 rounded ml-2">Select an Action</button>
			</div>
			<div className="flex gap-2 mb-2">
				<button className={tab === "Active" ? "font-bold underline" : ""} onClick={() => setTab("Active")}>Active</button>
				<button className={tab === "Terminated" ? "font-bold underline" : ""} onClick={() => setTab("Terminated")}>Terminated</button>
				<button className={tab === "All" ? "font-bold underline" : ""} onClick={() => setTab("All")}>All</button>
			</div>
			<div className="flex flex-wrap gap-2 mb-2">
				<button className="bg-white border px-2 py-1 rounded">Print</button>
				<button className="bg-white border px-2 py-1 rounded">Excel</button>
				<button className="bg-white border px-2 py-1 rounded">CSV</button>
				<button className="bg-white border px-2 py-1 rounded">Copy</button>
				<button className="bg-blue-500 text-white px-2 py-1 rounded">Bulk Export</button>
				<button className="bg-white border px-2 py-1 rounded">Hide Columns</button>
			</div>
			<div className="overflow-x-auto">
				<table className="min-w-full border text-xs">
					<thead className="bg-gray-100">
						<tr>
							<th className="border px-2 py-1"><input type="checkbox" checked={selected.length === filtered.length && filtered.length > 0} onChange={e => e.target.checked ? selectAll() : deselectAll()} /></th>
							<th className="border px-2 py-1">Staff No</th>
							<th className="border px-2 py-1">Name</th>
							<th className="border px-2 py-1">Job Title</th>
							<th className="border px-2 py-1">Type</th>
							<th className="border px-2 py-1">Emp. Date</th>
							<th className="border px-2 py-1">Emp. Duration</th>
							<th className="border px-2 py-1">Basic Pay</th>
							<th className="border px-2 py-1">Gender</th>
							<th className="border px-2 py-1">Date of Birth</th>
							<th className="border px-2 py-1">Age</th>
							<th className="border px-2 py-1">Email (Personal)</th>
							<th className="border px-2 py-1">Phone</th>
							<th className="border px-2 py-1">PIN</th>
							<th className="border px-2 py-1">Actions</th>
						</tr>
					</thead>
					<tbody>
						{loading ? (
							<tr>
								<td className="border px-2 py-2 text-center" colSpan={15}>
									Loading…
								</td>
							</tr>
						) : filtered.length === 0 ? (
							<tr>
								<td className="border px-2 py-2 text-center" colSpan={15}>
									No employees found.
								</td>
							</tr>
						) : (
							filtered.map((emp) => (
								<tr key={emp.staff_no} className={selected.includes(emp.staff_no) ? "bg-blue-50" : ""}>
									<td className="border px-2 py-1"><input type="checkbox" checked={selected.includes(emp.staff_no)} onChange={() => toggleSelect(emp.staff_no)} /></td>
									<td className="border px-2 py-1">{emp.staff_no}</td>
									<td className="border px-2 py-1">{emp.name}</td>
									<td className="border px-2 py-1">{emp.job_title || ""}</td>
									<td className="border px-2 py-1">{emp.employment_type || ""}</td>
									<td className="border px-2 py-1">{emp.date_of_employment ? new Date(emp.date_of_employment).toLocaleDateString() : ""}</td>
									<td className="border px-2 py-1">{emp.date_of_employment ? `${Math.floor((Date.now() - new Date(emp.date_of_employment).getTime()) / (1000*60*60*24*365))} yrs` : ""}</td>
									<td className="border px-2 py-1">{emp.basic_salary || ""}</td>
									<td className="border px-2 py-1">{emp.gender || ""}</td>
									<td className="border px-2 py-1">{emp.date_of_birth ? new Date(emp.date_of_birth).toLocaleDateString() : ""}</td>
									<td className="border px-2 py-1">{emp.date_of_birth ? `${Math.floor((Date.now() - new Date(emp.date_of_birth).getTime()) / (1000*60*60*24*365))}` : ""}</td>
									<td className="border px-2 py-1">{emp.personal_email || emp.official_email || ""}</td>
									<td className="border px-2 py-1">{emp.phone || ""}</td>
									<td className="border px-2 py-1">{emp.kra_pin || ""}</td>
									<td className="border px-2 py-1">
										<button
											className="bg-blue-600 text-white px-2 py-1 text-xs rounded"
											onClick={() => setSelectedEmployee(emp)}
										>
											View
										</button>
									</td>
								</tr>
							))
						)}
					</tbody>
				</table>
			</div>

					{selectedEmployee && (
						<EmployeeDetailsModal
							employee={selectedEmployee}
							employees={employees}
							onClose={() => setSelectedEmployee(null)}
						/>
					)}
					{showNewModal && (
						<EmployeeDetailsModal
							employee={{}}
							employees={employees}
							onClose={() => setShowNewModal(false)}
						/>
					)}
		</div>
	);
};

export default EmployeeList;
