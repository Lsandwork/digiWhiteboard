export const WARNING_NOTICE_VIOLATION_TYPES = [
  "Absenteeism",
  "Tardiness",
  "Work Quality",
  "Conduct",
  "Insubordination",
  "Uncooperative",
  "Safety",
  "Carelessness",
  "Other"
] as const;

export type WarningNoticeViolationType = (typeof WARNING_NOTICE_VIOLATION_TYPES)[number];

export type PreviousWarningRow = {
  date: string;
  verbal: boolean;
  written: boolean;
  by_whom: string;
  violation_details: string;
};

export type WarningNoticeFormData = {
  employee_name: string;
  violation_date: string;
  documented_by: string;
  violation_time: string;
  violation_types: WarningNoticeViolationType[];
  violation_other: string;
  statement_of_violation: string;
  employee_statement: string;
  date_of_warning: string;
  type_of_warning: string;
  employee_number: string;
  employee_department: string;
  previous_warnings: PreviousWarningRow[];
  action_to_be_taken: string;
  employee_signature: string;
  employee_signature_date: string;
  manager_signature: string;
  manager_signature_date: string;
};

export const EMPTY_WARNING_NOTICE_FORM: WarningNoticeFormData = {
  employee_name: "",
  violation_date: "",
  documented_by: "",
  violation_time: "",
  violation_types: [],
  violation_other: "",
  statement_of_violation: "",
  employee_statement: "",
  date_of_warning: "",
  type_of_warning: "",
  employee_number: "",
  employee_department: "Daycare",
  previous_warnings: [
    { date: "", verbal: false, written: false, by_whom: "", violation_details: "" },
    { date: "", verbal: false, written: false, by_whom: "", violation_details: "" },
    { date: "", verbal: false, written: false, by_whom: "", violation_details: "" }
  ],
  action_to_be_taken: "",
  employee_signature: "",
  employee_signature_date: "",
  manager_signature: "",
  manager_signature_date: ""
};
