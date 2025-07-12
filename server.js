const express = require('express');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const cors = require('cors');

// Load data
const DATA_DIR = path.join(__dirname, 'data');
console.log(path.join(DATA_DIR, 'staff.json'))
const STAFF = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'staffs.json')));
const LOANS = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'loans.json')));

// Config
const SECRET = process.env.JWT_SECRET || 'super-secret-key';
const PORT = process.env.PORT || 3000;

// Middlewares
const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));

// Error handler
function globalErrorHandler(err, req, res, next) {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Server Error' });
}

// Saving Current state of loans
function saveLoans() {
  fs.writeFileSync(
    path.join(DATA_DIR, 'loans.json'),
    JSON.stringify(LOANS, null, 2),
    'utf-8'
  );
}

// Auth middleware
function authenticate(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ message: 'Missing token' });
  const token = auth.split(' ')[1];
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch (e) {
    res.status(403).json({ error: 'Invalid token' });
  }
}

// Role guard
function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}


app.get('/',(req,res)=>{
    return res.status(200).json({messagae:'Welcome to the express loan api'})
})
// --- Authentication Endpoints ---
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  console.log({email,password})
  if(!email || !password) res.status(400).json({'message':'please enter all required fields'})
  const user = STAFF.find((user) => user.email === email && user.password === password);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, SECRET, { expiresIn: '1h' });
  console.log(token)
  return res.status(200).json({'messagae':'Request Successful', token });
});

app.post('/logout', authenticate, (req, res) => {
  res.json({ message: 'Logged out' });
});

// --- Loans Endpoints (Protected) ---
app.get('/loans', authenticate, (req, res) => {
  const status = req.query.status;
  console.log({status})
  let loans = LOANS.slice();
  if (status) loans = loans.filter(loan => loan.status === status);

  if (!['admin', 'superAdmin'].includes(req.user.role)) {
    loans = loans.map(loan => ({
      ...loan,
      applicant: { ...loan.applicant, totalLoan: undefined }
    }));
  }
  return res.status(200).json({message:'request successful', loans });
});

app.get('/loans/:userEmail/get', authenticate, (req, res) => {
  const email = req.params.userEmail;
  let loans = LOANS.filter(loan => loan.applicant.email === email);

  loans = loans.map(loan => {
    if (!['admin', 'superAdmin'].includes(req.user.role)) {
      return { ...loan, applicant: { ...loan.applicant, totalLoan: undefined } };
    }
    return l;
  });
  return res.status(200).json({message:'request was successful',loans });
});

app.get('/loans/expired', authenticate, (req, res) => {
  const now = Date.now();
  let expired = LOANS.filter(loan => new Date(loan.maturityDate).getTime() < now);

  if (!['admin', 'superAdmin'].includes(req.user.role)) {
    expired = expired.map(loan => ({
      ...loan,
      applicant: { ...loan.applicant, totalLoan: undefined }
    }));
  }
  return res.status(200).json({ messagae:'Request Successful', loans: expired });
});

app.delete('/loan/:loanId/delete', authenticate, allowRoles('superAdmin'), (req, res) => {
  const id = req.params.loanId;
  const index = LOANS.findIndex(loan => loan.id === id);
  if (index === -1) return res.status(404).json({ error: 'Loan not found' });

  LOANS.splice(index, 1);
  saveLoans();
  return res.status(204).json({ message: 'Loan deleted', id });
});

// Global error handler
app.use(globalErrorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`Express API running on http://localhost:${PORT}`);
});
