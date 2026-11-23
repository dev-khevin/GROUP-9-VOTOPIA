const TABLES = {
  LEGACY: { students: 'students_ssc', candidates: 'candidates_ssc' },
  BSIT: { students: 'students_bsit', candidates: 'candidates_bsit' },
  BSBA: { students: 'students_bsba', candidates: 'candidates_bsba' },
  BSCE: { students: 'students_bsce', candidates: 'candidates_bsce' },
};
const DEPARTMENT_IDS = Object.keys(TABLES);

function getTables(departmentId) {
  const tables = TABLES[departmentId];
  if (!tables) {
    throw new Error('Invalid department for voter or candidate table.');
  }
  return tables;
}

const studentTable = (departmentId) => getTables(departmentId).students;
const candidateTable = (departmentId) => getTables(departmentId).candidates;

module.exports = { DEPARTMENT_IDS, studentTable, candidateTable };
