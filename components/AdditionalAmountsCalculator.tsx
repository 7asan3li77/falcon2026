
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { PlusIcon, DeleteIcon, UndoIcon, CogIcon, SaveIcon, CloseIcon, SearchIcon, FileUploadIcon, FileDownloadIcon, RefreshIcon, LockClosedIcon, LockOpenIcon } from './Icons';
import { produce } from 'immer';
import { User } from '../types';
import PasswordInput from './PasswordInput';


declare var html2pdf: any;

// --- Types ---
interface SubscriptionPeriod {
  id: number;
  from: string; // YYYY-MM
  to: string;   // YYYY-MM
  amount: string;
  interestEndDate: string;
}

interface MonthlyInterestRate {
    date: string; // YYYY-MM
    rate: string;
}

interface BulkRatePeriod {
    id: number;
    from: string;
    to: string;
    rate: string;
}

interface CalculationResult {
  totalPreviousSubscriptions: number;
  totalPreviousInterest: number;
  totalCurrentSubscriptions: number;
  totalCurrentInterest: number;
  totalCombinedInterest: number;
  finalSettlementAmount: number;
  detailedBreakdown: {
      month: string; // Subscription month
      amount: number;
      rate: number;
      interestValue: number;
      isPrevious: boolean; // For styling
      details: string; // e.g., "Calculated on cumulative total of 1500.00"
  }[];
}

interface LastDeleted {
    period: SubscriptionPeriod;
    index: number;
}


// --- Defaults and Constants ---
const INTEREST_RATES_STORAGE_KEY = 'falcon_additional_amounts_monthly_rates_v2';
const DEFAULT_MONTHLY_RATES: MonthlyInterestRate[] = [
  { "date": "1976-10", "rate": "0.5" }, { "date": "1976-11", "rate": "0.5" }, { "date": "1976-12", "rate": "0.5" },
  { "date": "1977-01", "rate": "0.5" }, { "date": "1977-02", "rate": "0.5" }, { "date": "1977-03", "rate": "0.5" }, { "date": "1977-04", "rate": "0.5" }, { "date": "1977-05", "rate": "0.5" }, { "date": "1977-06", "rate": "0.5" }, { "date": "1977-07", "rate": "0.5" }, { "date": "1977-08", "rate": "0.5" }, { "date": "1977-09", "rate": "0.5" }, { "date": "1977-10", "rate": "0.5" }, { "date": "1977-11", "rate": "0.5" }, { "date": "1977-12", "rate": "0.5" },
  { "date": "1978-01", "rate": "0.5" }, { "date": "1978-02", "rate": "0.5" }, { "date": "1978-03", "rate": "0.5" }, { "date": "1978-04", "rate": "0.5" }, { "date": "1978-05", "rate": "0.5" }, { "date": "1978-06", "rate": "0.5" }, { "date": "1978-07", "rate": "0.5" }, { "date": "1978-08", "rate": "0.5" }, { "date": "1978-09", "rate": "0.5" }, { "date": "1978-10", "rate": "0.5" }, { "date": "1978-11", "rate": "0.5" }, { "date": "1978-12", "rate": "0.5" },
  { "date": "1979-01", "rate": "0.5" }, { "date": "1979-02", "rate": "0.5" }, { "date": "1979-03", "rate": "0.5" }, { "date": "1979-04", "rate": "0.5" }, { "date": "1979-05", "rate": "0.5" }, { "date": "1979-06", "rate": "0.5" }, { "date": "1979-07", "rate": "0.5" }, { "date": "1979-08", "rate": "0.5" }, { "date": "1979-09", "rate": "0.5" }, { "date": "1979-10", "rate": "0.5" }, { "date": "1979-11", "rate": "0.5" }, { "date": "1979-12", "rate": "0.5" },
  { "date": "1980-01", "rate": "0.5" }, { "date": "1980-02", "rate": "0.5" }, { "date": "1980-03", "rate": "0.5" }, { "date": "1980-04", "rate": "0.5" }, { "date": "1980-05", "rate": "0.5" }, { "date": "1980-06", "rate": "0.5" }, { "date": "1980-07", "rate": "0.5" }, { "date": "1980-08", "rate": "0.5" }, { "date": "1980-09", "rate": "0.5" }, { "date": "1980-10", "rate": "0.5" }, { "date": "1980-11", "rate": "0.5" }, { "date": "1980-12", "rate": "0.5" },
  { "date": "1981-01", "rate": "0.5" }, { "date": "1981-02", "rate": "0.5" }, { "date": "1981-03", "rate": "0.5" }, { "date": "1981-04", "rate": "0.5" }, { "date": "1981-05", "rate": "0.5" }, { "date": "1981-06", "rate": "0.5" }, { "date": "1981-07", "rate": "0.5" }, { "date": "1981-08", "rate": "0.5" }, { "date": "1981-09", "rate": "0.5" }, { "date": "1981-10", "rate": "0.5" }, { "date": "1981-11", "rate": "0.5" }, { "date": "1981-12", "rate": "0.5" },
  { "date": "1982-01", "rate": "0.5" }, { "date": "1982-02", "rate": "0.5" }, { "date": "1982-03", "rate": "0.5" }, { "date": "1982-04", "rate": "0.5" }, { "date": "1982-05", "rate": "0.5" }, { "date": "1982-06", "rate": "0.5" }, { "date": "1982-07", "rate": "0.5" }, { "date": "1982-08", "rate": "0.5" }, { "date": "1982-09", "rate": "0.5" }, { "date": "1982-10", "rate": "0.5" }, { "date": "1982-11", "rate": "0.5" }, { "date": "1982-12", "rate": "0.5" },
  { "date": "1983-01", "rate": "0.5" }, { "date": "1983-02", "rate": "0.5" }, { "date": "1983-03", "rate": "0.5" }, { "date": "1983-04", "rate": "0.5" }, { "date": "1983-05", "rate": "0.5" }, { "date": "1983-06", "rate": "0.5" }, { "date": "1983-07", "rate": "0.5" }, { "date": "1983-08", "rate": "0.5" }, { "date": "1983-09", "rate": "0.5" }, { "date": "1983-10", "rate": "0.5" }, { "date": "1983-11", "rate": "0.5" }, { "date": "1983-12", "rate": "0.5" },
  { "date": "1984-01", "rate": "0.5" }, { "date": "1984-02", "rate": "0.5" }, { "date": "1984-03", "rate": "0.5" }, { "date": "1984-04", "rate": "1" }, { "date": "1984-05", "rate": "1" }, { "date": "1984-06", "rate": "1" }, { "date": "1984-07", "rate": "1" }, { "date": "1984-08", "rate": "1" }, { "date": "1984-09", "rate": "1" }, { "date": "1984-10", "rate": "1" }, { "date": "1984-11", "rate": "1" }, { "date": "1984-12", "rate": "1" },
  { "date": "1985-01", "rate": "1" }, { "date": "1985-02", "rate": "1" }, { "date": "1985-03", "rate": "1" }, { "date": "1985-04", "rate": "1" }, { "date": "1985-05", "rate": "1" }, { "date": "1985-06", "rate": "1" }, { "date": "1985-07", "rate": "1" }, { "date": "1985-08", "rate": "1" }, { "date": "1985-09", "rate": "1" }, { "date": "1985-10", "rate": "1" }, { "date": "1985-11", "rate": "1" }, { "date": "1985-12", "rate": "1" },
  { "date": "1986-01", "rate": "1" }, { "date": "1986-02", "rate": "1" }, { "date": "1986-03", "rate": "1" }, { "date": "1986-04", "rate": "1" }, { "date": "1986-05", "rate": "1" }, { "date": "1986-06", "rate": "1" }, { "date": "1986-07", "rate": "1" }, { "date": "1986-08", "rate": "1" }, { "date": "1986-09", "rate": "1" }, { "date": "1986-10", "rate": "1" }, { "date": "1986-11", "rate": "1" }, { "date": "1986-12", "rate": "1" },
  { "date": "1987-01", "rate": "1" }, { "date": "1987-02", "rate": "1" }, { "date": "1987-03", "rate": "1" }, { "date": "1987-04", "rate": "1" }, { "date": "1987-05", "rate": "1" }, { "date": "1987-06", "rate": "1" }, { "date": "1987-07", "rate": "1" }, { "date": "1987-08", "rate": "1" }, { "date": "1987-09", "rate": "1" }, { "date": "1987-10", "rate": "1" }, { "date": "1987-11", "rate": "1" }, { "date": "1987-12", "rate": "1" },
  { "date": "1988-01", "rate": "1" }, { "date": "1988-02", "rate": "1" }, { "date": "1988-03", "rate": "1" }, { "date": "1988-04", "rate": "1" }, { "date": "1988-05", "rate": "1" }, { "date": "1988-06", "rate": "1" }, { "date": "1988-07", "rate": "1" }, { "date": "1988-08", "rate": "1" }, { "date": "1988-09", "rate": "1" }, { "date": "1988-10", "rate": "1" }, { "date": "1988-11", "rate": "1" }, { "date": "1988-12", "rate": "1" },
  { "date": "1989-01", "rate": "1" }, { "date": "1989-02", "rate": "1" }, { "date": "1989-03", "rate": "1" }, { "date": "1989-04", "rate": "1" }, { "date": "1989-05", "rate": "1" }, { "date": "1989-06", "rate": "1" }, { "date": "1989-07", "rate": "1" }, { "date": "1989-08", "rate": "1" }, { "date": "1989-09", "rate": "1" }, { "date": "1989-10", "rate": "1" }, { "date": "1989-11", "rate": "1" }, { "date": "1989-12", "rate": "1" },
  { "date": "1990-01", "rate": "1" }, { "date": "1990-02", "rate": "1" }, { "date": "1990-03", "rate": "1" }, { "date": "1990-04", "rate": "1" }, { "date": "1990-05", "rate": "1" }, { "date": "1990-06", "rate": "1" }, { "date": "1990-07", "rate": "1" }, { "date": "1990-08", "rate": "1" }, { "date": "1990-09", "rate": "1" }, { "date": "1990-10", "rate": "1" }, { "date": "1990-11", "rate": "1" }, { "date": "1990-12", "rate": "1" },
  { "date": "1991-01", "rate": "1" }, { "date": "1991-02", "rate": "1" }, { "date": "1991-03", "rate": "1" }, { "date": "1991-04", "rate": "1" }, { "date": "1991-05", "rate": "1" }, { "date": "1991-06", "rate": "1" }, { "date": "1991-07", "rate": "1" }, { "date": "1991-08", "rate": "1" }, { "date": "1991-09", "rate": "1" }, { "date": "1991-10", "rate": "1" }, { "date": "1991-11", "rate": "1" }, { "date": "1991-12", "rate": "1" },
  { "date": "1992-01", "rate": "1" }, { "date": "1992-02", "rate": "1" }, { "date": "1992-03", "rate": "1" }, { "date": "1992-04", "rate": "1" }, { "date": "1992-05", "rate": "1" }, { "date": "1992-06", "rate": "1" }, { "date": "1992-07", "rate": "1" }, { "date": "1992-08", "rate": "1" }, { "date": "1992-09", "rate": "1" }, { "date": "1992-10", "rate": "1" }, { "date": "1992-11", "rate": "1" }, { "date": "1992-12", "rate": "1" },
  { "date": "1993-01", "rate": "1" }, { "date": "1993-02", "rate": "1" }, { "date": "1993-03", "rate": "1" }, { "date": "1993-04", "rate": "1" }, { "date": "1993-05", "rate": "1" }, { "date": "1993-06", "rate": "1" }, { "date": "1993-07", "rate": "1" }, { "date": "1993-08", "rate": "1" }, { "date": "1993-09", "rate": "1" }, { "date": "1993-10", "rate": "1" }, { "date": "1993-11", "rate": "1" }, { "date": "1993-12", "rate": "1" },
  { "date": "1994-01", "rate": "1" }, { "date": "1994-02", "rate": "1" }, { "date": "1994-03", "rate": "1" }, { "date": "1994-04", "rate": "1" }, { "date": "1994-05", "rate": "1" }, { "date": "1994-06", "rate": "1" }, { "date": "1994-07", "rate": "1" }, { "date": "1994-08", "rate": "1" }, { "date": "1994-09", "rate": "1" }, { "date": "1994-10", "rate": "1" }, { "date": "1994-11", "rate": "1" }, { "date": "1994-12", "rate": "1" },
  { "date": "1995-01", "rate": "1" }, { "date": "1995-02", "rate": "1" }, { "date": "1995-03", "rate": "1" }, { "date": "1995-04", "rate": "1" }, { "date": "1995-05", "rate": "1" }, { "date": "1995-06", "rate": "1" }, { "date": "1995-07", "rate": "1" }, { "date": "1995-08", "rate": "1" }, { "date": "1995-09", "rate": "1" }, { "date": "1995-10", "rate": "1" }, { "date": "1995-11", "rate": "1" }, { "date": "1995-12", "rate": "1" },
  { "date": "1996-01", "rate": "1" }, { "date": "1996-02", "rate": "1" }, { "date": "1996-03", "rate": "1" }, { "date": "1996-04", "rate": "1" }, { "date": "1996-05", "rate": "1" }, { "date": "1996-06", "rate": "1" }, { "date": "1996-07", "rate": "1" }, { "date": "1996-08", "rate": "1" }, { "date": "1996-09", "rate": "1" }, { "date": "1996-10", "rate": "1" }, { "date": "1996-11", "rate": "1" }, { "date": "1996-12", "rate": "1" },
  { "date": "1997-01", "rate": "1" }, { "date": "1997-02", "rate": "1" }, { "date": "1997-03", "rate": "1" }, { "date": "1997-04", "rate": "1" }, { "date": "1997-05", "rate": "1" }, { "date": "1997-06", "rate": "1" }, { "date": "1997-07", "rate": "1" }, { "date": "1997-08", "rate": "1" }, { "date": "1997-09", "rate": "1" }, { "date": "1997-10", "rate": "1" }, { "date": "1997-11", "rate": "1" }, { "date": "1997-12", "rate": "1" },
  { "date": "1998-01", "rate": "1" }, { "date": "1998-02", "rate": "1" }, { "date": "1998-03", "rate": "1" }, { "date": "1998-04", "rate": "1" }, { "date": "1998-05", "rate": "1" }, { "date": "1998-06", "rate": "1" }, { "date": "1998-07", "rate": "1" }, { "date": "1998-08", "rate": "1" }, { "date": "1998-09", "rate": "1" }, { "date": "1998-10", "rate": "1" }, { "date": "1998-11", "rate": "1" }, { "date": "1998-12", "rate": "1" },
  { "date": "1999-01", "rate": "1" }, { "date": "1999-02", "rate": "1" }, { "date": "1999-03", "rate": "1" }, { "date": "1999-04", "rate": "1" }, { "date": "1999-05", "rate": "1" }, { "date": "1999-06", "rate": "1" }, { "date": "1999-07", "rate": "1" }, { "date": "1999-08", "rate": "1" }, { "date": "1999-09", "rate": "1" }, { "date": "1999-10", "rate": "1" }, { "date": "1999-11", "rate": "1" }, { "date": "1999-12", "rate": "1" },
  { "date": "2000-01", "rate": "1" }, { "date": "2000-02", "rate": "1" }, { "date": "2000-03", "rate": "1" }, { "date": "2000-04", "rate": "1" }, { "date": "2000-05", "rate": "1" }, { "date": "2000-06", "rate": "1" }, { "date": "2000-07", "rate": "1" }, { "date": "2000-08", "rate": "1" }, { "date": "2000-09", "rate": "1" }, { "date": "2000-10", "rate": "1" }, { "date": "2000-11", "rate": "1" }, { "date": "2000-12", "rate": "1" },
  { "date": "2001-01", "rate": "1" }, { "date": "2001-02", "rate": "1" }, { "date": "2001-03", "rate": "1" }, { "date": "2001-04", "rate": "1" }, { "date": "2001-05", "rate": "1" }, { "date": "2001-06", "rate": "1" }, { "date": "2001-07", "rate": "1" }, { "date": "2001-08", "rate": "1" }, { "date": "2001-09", "rate": "1" }, { "date": "2001-10", "rate": "1" }, { "date": "2001-11", "rate": "1" }, { "date": "2001-12", "rate": "1" },
  { "date": "2002-01", "rate": "1" }, { "date": "2002-02", "rate": "1" }, { "date": "2002-03", "rate": "1" }, { "date": "2002-04", "rate": "1" }, { "date": "2002-05", "rate": "1" }, { "date": "2002-06", "rate": "1" }, { "date": "2002-07", "rate": "1" }, { "date": "2002-08", "rate": "1" }, { "date": "2002-09", "rate": "1" }, { "date": "2002-10", "rate": "1" }, { "date": "2002-11", "rate": "1" }, { "date": "2002-12", "rate": "1" },
  { "date": "2003-01", "rate": "1" }, { "date": "2003-02", "rate": "1" }, { "date": "2003-03", "rate": "1" }, { "date": "2003-04", "rate": "1" }, { "date": "2003-05", "rate": "1" }, { "date": "2003-06", "rate": "1" }, { "date": "2003-07", "rate": "1.5" }, { "date": "2003-08", "rate": "1.5" }, { "date": "2003-09", "rate": "1.5" }, { "date": "2003-10", "rate": "1.5" }, { "date": "2003-11", "rate": "1.5" }, { "date": "2003-12", "rate": "1.5" },
  { "date": "2004-01", "rate": "1.5" }, { "date": "2004-02", "rate": "1.5" }, { "date": "2004-03", "rate": "1.5" }, { "date": "2004-04", "rate": "1.5" }, { "date": "2004-05", "rate": "1.5" }, { "date": "2004-06", "rate": "1.5" }, { "date": "2004-07", "rate": "2.5" }, { "date": "2004-08", "rate": "2.5" }, { "date": "2004-09", "rate": "2.5" }, { "date": "2004-10", "rate": "2.5" }, { "date": "2004-11", "rate": "2.5" }, { "date": "2004-12", "rate": "2.5" },
  { "date": "2005-01", "rate": "2.5" }, { "date": "2005-02", "rate": "2.5" }, { "date": "2005-03", "rate": "2.5" }, { "date": "2005-04", "rate": "2.5" }, { "date": "2005-05", "rate": "2.5" }, { "date": "2005-06", "rate": "2.5" }, { "date": "2005-07", "rate": "2.5" }, { "date": "2005-08", "rate": "2.5" }, { "date": "2005-09", "rate": "2.5" }, { "date": "2005-10", "rate": "2.5" }, { "date": "2005-11", "rate": "2.5" }, { "date": "2005-12", "rate": "2.5" },
  { "date": "2006-01", "rate": "2.5" }, { "date": "2006-02", "rate": "2.5" }, { "date": "2006-03", "rate": "2.5" }, { "date": "2006-04", "rate": "2.5" }, { "date": "2006-05", "rate": "2.5" }, { "date": "2006-06", "rate": "2.5" }, { "date": "2006-07", "rate": "2.5" }, { "date": "2006-08", "rate": "2.5" }, { "date": "2006-09", "rate": "2.5" }, { "date": "2006-10", "rate": "2.5" }, { "date": "2006-11", "rate": "2.5" }, { "date": "2006-12", "rate": "2.5" },
  { "date": "2007-01", "rate": "0.91" }, { "date": "2007-02", "rate": "0.91" }, { "date": "2007-03", "rate": "0.91" }, { "date": "2007-04", "rate": "0.91" }, { "date": "2007-05", "rate": "0.91" }, { "date": "2007-06", "rate": "0.91" }, { "date": "2007-07", "rate": "0.91" }, { "date": "2007-08", "rate": "0.91" }, { "date": "2007-09", "rate": "0.91" }, { "date": "2007-10", "rate": "0.91" }, { "date": "2007-11", "rate": "0.91" }, { "date": "2007-12", "rate": "0.91" },
  { "date": "2008-01", "rate": "0.91" }, { "date": "2008-02", "rate": "0.91" }, { "date": "2008-03", "rate": "0.91" }, { "date": "2008-04", "rate": "0.91" }, { "date": "2008-05", "rate": "0.91" }, { "date": "2008-06", "rate": "1" }, { "date": "2008-07", "rate": "1.08" }, { "date": "2008-08", "rate": "1.125" }, { "date": "2008-09", "rate": "1.125" }, { "date": "2008-10", "rate": "1.125" }, { "date": "2008-11", "rate": "1.125" }, { "date": "2008-12", "rate": "1.125" },
  { "date": "2009-01", "rate": "1.042" }, { "date": "2009-02", "rate": "1" }, { "date": "2009-03", "rate": "1.010" }, { "date": "2009-04", "rate": "0.958" }, { "date": "2009-05", "rate": "0.920" }, { "date": "2009-06", "rate": "0.920" }, { "date": "2009-07", "rate": "0.875" }, { "date": "2009-08", "rate": "0.875" }, { "date": "2009-09", "rate": "0.875" }, { "date": "2009-10", "rate": "0.875" }, { "date": "2009-11", "rate": "0.875" }, { "date": "2009-12", "rate": "0.875" },
  { "date": "2010-01", "rate": "0.875" }, { "date": "2010-02", "rate": "0.875" }, { "date": "2010-03", "rate": "0.875" }, { "date": "2010-04", "rate": "0.875" }, { "date": "2010-05", "rate": "0.875" }, { "date": "2010-06", "rate": "0.875" }, { "date": "2010-07", "rate": "0.875" }, { "date": "2010-08", "rate": "0.875" }, { "date": "2010-09", "rate": "0.875" }, { "date": "2010-10", "rate": "0.875" }, { "date": "2010-11", "rate": "0.875" }, { "date": "2010-12", "rate": "0.875" },
  { "date": "2011-01", "rate": "0.875" }, { "date": "2011-02", "rate": "0.875" }, { "date": "2011-03", "rate": "0.875" }, { "date": "2011-04", "rate": "0.875" }, { "date": "2011-05", "rate": "0.875" }, { "date": "2011-06", "rate": "0.875" }, { "date": "2011-07", "rate": "0.875" }, { "date": "2011-08", "rate": "0.875" }, { "date": "2011-09", "rate": "0.875" }, { "date": "2011-10", "rate": "0.875" }, { "date": "2011-11", "rate": "0.875" }, { "date": "2011-12", "rate": "0.958" },
  { "date": "2012-01", "rate": "0.958" }, { "date": "2012-02", "rate": "0.958" }, { "date": "2012-03", "rate": "0.958" }, { "date": "2012-04", "rate": "0.958" }, { "date": "2012-05", "rate": "0.958" }, { "date": "2012-06", "rate": "0.958" }, { "date": "2012-07", "rate": "0.958" }, { "date": "2012-08", "rate": "0.958" }, { "date": "2012-09", "rate": "0.958" }, { "date": "2012-10", "rate": "0.958" }, { "date": "2012-11", "rate": "0.958" }, { "date": "2012-12", "rate": "0.958" },
  { "date": "2013-01", "rate": "0.958" }, { "date": "2013-02", "rate": "0.958" }, { "date": "2013-03", "rate": "1.020" }, { "date": "2013-04", "rate": "1.020" }, { "date": "2013-05", "rate": "1.020" }, { "date": "2013-06", "rate": "1.020" }, { "date": "2013-07", "rate": "0.980" }, { "date": "2013-08", "rate": "0.980" }, { "date": "2013-09", "rate": "0.937" }, { "date": "2013-10", "rate": "0.937" }, { "date": "2013-11", "rate": "0.895" }, { "date": "2013-12", "rate": "0.895" },
  { "date": "2014-01", "rate": "0.895" }, { "date": "2014-02", "rate": "0.895" }, { "date": "2014-03", "rate": "0.895" }, { "date": "2014-04", "rate": "0.895" }, { "date": "2014-05", "rate": "0.895" }, { "date": "2014-06", "rate": "0.895" }, { "date": "2014-07", "rate": "0.98" }, { "date": "2014-08", "rate": "0.98" }, { "date": "2014-09", "rate": "0.98" }, { "date": "2014-10", "rate": "0.98" }, { "date": "2014-11", "rate": "0.98" }, { "date": "2014-12", "rate": "0.94" },
  { "date": "2015-01", "rate": "0.94" }, { "date": "2015-02", "rate": "0.94" }, { "date": "2015-03", "rate": "0.94" }, { "date": "2015-04", "rate": "0.94" }, { "date": "2015-05", "rate": "0.94" }, { "date": "2015-06", "rate": "0.94" }, { "date": "2015-07", "rate": "0.94" }, { "date": "2015-08", "rate": "0.94" }, { "date": "2015-09", "rate": "0.94" }, { "date": "2015-10", "rate": "0.94" }, { "date": "2015-11", "rate": "0.94" }, { "date": "2015-12", "rate": "0.94" },
  { "date": "2016-01", "rate": "0.94" }, { "date": "2016-02", "rate": "0.94" }, { "date": "2016-03", "rate": "0.94" }, { "date": "2016-04", "rate": "0.94" }, { "date": "2016-05", "rate": "1.19" }, { "date": "2016-06", "rate": "1.19" }, { "date": "2016-07", "rate": "1.19" }, { "date": "2016-08", "rate": "1.19" }, { "date": "2016-09", "rate": "1.19" }, { "date": "2016-10", "rate": "1.44" }, { "date": "2016-11", "rate": "1.44" }, { "date": "2016-12", "rate": "1.44" },
  { "date": "2017-01", "rate": "1.44" }, { "date": "2017-02", "rate": "1.44" }, { "date": "2017-03", "rate": "1.44" }, { "date": "2017-04", "rate": "1.44" }, { "date": "2017-05", "rate": "1.6" }, { "date": "2017-06", "rate": "1.77" }, { "date": "2017-07", "rate": "1.77" }, { "date": "2017-08", "rate": "1.77" }, { "date": "2017-09", "rate": "1.77" }, { "date": "2017-10", "rate": "1.77" }, { "date": "2017-11", "rate": "1.77" }, { "date": "2017-12", "rate": "1.77" },
  { "date": "2018-01", "rate": "1.77" }, { "date": "2018-02", "rate": "1.690" }, { "date": "2018-03", "rate": "1.6" }, { "date": "2018-04", "rate": "1.6" }, { "date": "2018-05", "rate": "1.6" }, { "date": "2018-06", "rate": "1.6" }, { "date": "2018-07", "rate": "1.6" }, { "date": "2018-08", "rate": "1.6" }, { "date": "2018-09", "rate": "1.6" }, { "date": "2018-10", "rate": "1.6" }, { "date": "2018-11", "rate": "1.6" }, { "date": "2018-12", "rate": "1.6" },
  { "date": "2019-01", "rate": "1.6" }, { "date": "2019-02", "rate": "1.52" }, { "date": "2019-03", "rate": "1.52" }, { "date": "2019-04", "rate": "1.52" }, { "date": "2019-05", "rate": "1.52" }, { "date": "2019-06", "rate": "1.52" }, { "date": "2019-07", "rate": "1.52" }, { "date": "2019-08", "rate": "1.4" }, { "date": "2019-09", "rate": "1.3" }, { "date": "2019-10", "rate": "1.23" }, { "date": "2019-11", "rate": "1.23" }, { "date": "2019-12", "rate": "1.23" },
  { "date": "2020-01", "rate": "1.23" }, { "date": "2020-02", "rate": "1.23" }, { "date": "2020-03", "rate": "1.23" }, { "date": "2020-04", "rate": "1.23" }, { "date": "2020-05", "rate": "1.23" }, { "date": "2020-06", "rate": "1.23" }, { "date": "2020-07", "rate": "1.23" }, { "date": "2020-08", "rate": "1.23" }, { "date": "2020-09", "rate": "1.25" }, { "date": "2020-10", "rate": "1.34" }, { "date": "2020-11", "rate": "1.34" }, { "date": "2020-12", "rate": "1.34" },
  { "date": "2021-01", "rate": "1.34" }, { "date": "2021-02", "rate": "1.34" }, { "date": "2021-03", "rate": "1.34" }, { "date": "2021-04", "rate": "1.34" }, { "date": "2021-05", "rate": "1.34" }, { "date": "2021-06", "rate": "1.34" }, { "date": "2021-07", "rate": "1.34" }, { "date": "2021-08", "rate": "1.34" }, { "date": "2021-09", "rate": "1.34" }, { "date": "2021-10", "rate": "1.34" }, { "date": "2021-11", "rate": "1.34" }, { "date": "2021-12", "rate": "1.34" },
  { "date": "2022-01", "rate": "1.34" }, { "date": "2022-02", "rate": "1.34" }, { "date": "2022-03", "rate": "1.34" }, { "date": "2022-04", "rate": "1.34" }, { "date": "2022-05", "rate": "1.34" }, { "date": "2022-06", "rate": "1.34" }, { "date": "2022-07", "rate": "1.34" }, { "date": "2022-08", "rate": "1.34" }, { "date": "2022-09", "rate": "1.34" }, { "date": "2022-10", "rate": "1.34" }, { "date": "2022-11", "rate": "1.58" }, { "date": "2022-12", "rate": "1.58" },
  { "date": "2023-01", "rate": "1.58" }, { "date": "2023-02", "rate": "1.58" }, { "date": "2023-03", "rate": "1.58" }, { "date": "2023-04", "rate": "1.58" }, { "date": "2023-05", "rate": "1.58" }, { "date": "2023-06", "rate": "1.58" }, { "date": "2023-07", "rate": "1.58" }, { "date": "2023-08", "rate": "2.2" }, { "date": "2023-09", "rate": "2.2" }, { "date": "2023-10", "rate": "2.32" }, { "date": "2023-11", "rate": "2.32" }, { "date": "2023-12", "rate": "2.32" },
  { "date": "2024-01", "rate": "2.36" }, { "date": "2024-02", "rate": "2.4" }, { "date": "2024-03", "rate": "2.57" }, { "date": "2024-04", "rate": "2.31" }, { "date": "2024-05", "rate": "2.31" }, { "date": "2024-06", "rate": "2.29" }, { "date": "2024-07", "rate": "2.33" }, { "date": "2024-08", "rate": "2.43" }, { "date": "2024-09", "rate": "2.43" }, { "date": "2024-10", "rate": "2.44" }, { "date": "2024-11", "rate": "2.46" }, { "date": "2024-12", "rate": "2.48" },
  { "date": "2025-01", "rate": "2.450" }, { "date": "2025-02", "rate": "2.270" }, { "date": "2025-03", "rate": "2.280" }, { "date": "2025-04", "rate": "2.250" }, { "date": "2025-05", "rate": "2.220" }, { "date": "2025-06", "rate": "2.250" }, { "date": "2025-07", "rate": "2.276" }, { "date": "2025-08", "rate": "2.299" }, { "date": "2025-09", "rate": "2.300" },
  { "date": "2025-10", "rate": "" }, { "date": "2025-11", "rate": "" }
];

let nextPeriodId = 0;
const createNewPeriod = (): SubscriptionPeriod => ({ id: nextPeriodId++, from: '', to: '', amount: '', interestEndDate: new Date().toISOString().slice(0, 7) });

let nextBulkRateId = 0;
const createNewBulkRatePeriod = (): BulkRatePeriod => ({ id: nextBulkRateId++, from: '', to: '', rate: '' });


// --- Main Calculator Component ---
interface AdditionalAmountsCalculatorProps {
    currentUser: User;
}

const AdditionalAmountsCalculator: React.FC<AdditionalAmountsCalculatorProps> = ({ currentUser }) => {
    // --- State Management ---
    const [subscriptionPeriods, setSubscriptionPeriods] = useState<SubscriptionPeriod[]>([createNewPeriod()]);
    const [lastDeleted, setLastDeleted] = useState<LastDeleted | null>(null);
    const [calculationResult, setCalculationResult] = useState<CalculationResult | null>(null);
    const [isRateManagerOpen, setRateManagerOpen] = useState(false);
    const [monthlyRates, setMonthlyRates] = useState<MonthlyInterestRate[]>(() => {
        try {
            const savedRates = localStorage.getItem(INTEREST_RATES_STORAGE_KEY);
            if (savedRates) {
                const parsed = JSON.parse(savedRates);
                if (Array.isArray(parsed)) {
                    return parsed;
                }
            }
            return DEFAULT_MONTHLY_RATES;
        } catch (error) {
            console.error("Failed to load rates from localStorage:", error);
            return DEFAULT_MONTHLY_RATES;
        }
    });

    const printRef = useRef<HTMLDivElement>(null);

    // --- Effects ---
    useEffect(() => {
        try {
            localStorage.setItem(INTEREST_RATES_STORAGE_KEY, JSON.stringify(monthlyRates));
        } catch (error) {
            console.error("Failed to save rates to localStorage:", error);
        }
    }, [monthlyRates]);
    
    // --- Handlers ---
    const handlePeriodChange = useCallback((id: number, field: keyof Omit<SubscriptionPeriod, 'id'>, value: string) => {
        setSubscriptionPeriods(produce(draft => {
            const period = draft.find(p => p.id === id);
            if (period) {
                (period as any)[field] = value;
            }
        }));
    }, []);

    const handleAddPeriod = useCallback(() => {
        setSubscriptionPeriods(prev => [...prev, createNewPeriod()]);
    }, []);

    const handleRemovePeriod = useCallback((id: number) => {
        const index = subscriptionPeriods.findIndex(p => p.id === id);
        if (index > -1) {
            setLastDeleted({ period: subscriptionPeriods[index], index });
            setSubscriptionPeriods(prev => prev.filter(p => p.id !== id));
        }
    }, [subscriptionPeriods]);

    const handleUndoDelete = useCallback(() => {
        if (lastDeleted) {
            setSubscriptionPeriods(produce(draft => {
                draft.splice(lastDeleted.index, 0, lastDeleted.period);
            }));
            setLastDeleted(null);
        }
    }, [lastDeleted]);

    const handleReset = useCallback(() => {
        setSubscriptionPeriods([createNewPeriod()]);
        setCalculationResult(null);
        setLastDeleted(null);
    }, []);
    
    const handleCalculate = useCallback(() => {
        // 1. Create a detailed list of every single monthly subscription and its properties.
        const allMonthlySubs: { month: string, amount: number, interestEndDate: string }[] = [];
        let earliestDate: Date | null = null;

        for (const period of subscriptionPeriods) {
            const amountForPeriod = parseFloat(period.amount) || 0;
            if (!period.from || !period.to || amountForPeriod <= 0) continue;

            let current = new Date(`${period.from}-01T00:00:00Z`);
            const end = new Date(`${period.to}-01T00:00:00Z`);
            const interestEndDateForPeriod = period.interestEndDate || new Date().toISOString().slice(0, 7);

            if (!earliestDate || current.getTime() < earliestDate.getTime()) {
                earliestDate = new Date(current);
            }
            
            while (current.getTime() <= end.getTime()) {
                const monthKey = current.toISOString().slice(0, 7);
                allMonthlySubs.push({
                    month: monthKey,
                    amount: amountForPeriod,
                    interestEndDate: interestEndDateForPeriod
                });
                current.setUTCMonth(current.getUTCMonth() + 1);
            }
        }
        
        if (allMonthlySubs.length === 0) {
            alert("يرجى إدخال فترة اشتراك واحدة على الأقل بمبلغ صحيح.");
            return;
        }

        // 2. Determine financial year
        const now = new Date();
        const financialYearStart = now.getUTCMonth() >= 6 // July is month 6 (0-indexed)
            ? new Date(Date.UTC(now.getUTCFullYear(), 6, 1))
            : new Date(Date.UTC(now.getUTCFullYear() - 1, 6, 1));
            
        // 3. Perform cumulative calculation
        const ratesMap = new Map<string, number>(monthlyRates.map(r => [r.date, parseFloat(r.rate) || 0]));
        
        const detailedBreakdown: CalculationResult['detailedBreakdown'] = [];
        let totalPreviousSubscriptions = 0, totalPreviousInterest = 0;
        let totalCurrentSubscriptions = 0, totalCurrentInterest = 0;
        
        const loopStart = new Date(earliestDate!);
        const loopEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)); // Last day of current month

        for (let d = new Date(loopStart); d.getTime() <= loopEnd.getTime(); d.setUTCMonth(d.getUTCMonth() + 1)) {
            const monthKey = d.toISOString().slice(0, 7);
            
            const currentMonthSubAmount = allMonthlySubs
                .filter(s => s.month === monthKey)
                .reduce((sum: number, s) => sum + s.amount, 0);

            const interestEligibleCumulative = allMonthlySubs
                .filter(s => s.month <= monthKey && monthKey <= s.interestEndDate)
                .reduce((sum: number, s) => sum + s.amount, 0);

            const rate = ratesMap.get(monthKey) || 0;
            const interestValue = interestEligibleCumulative * (rate / 100);
            
            const isPrevious = d.getTime() < financialYearStart.getTime();

            if (currentMonthSubAmount > 0 || interestValue > 0) { // Only add rows with activity
                 detailedBreakdown.push({
                    month: monthKey,
                    amount: currentMonthSubAmount,
                    rate: rate,
                    interestValue: interestValue,
                    isPrevious: isPrevious,
                    details: `على إجمالي تراكمي مستحق للفائدة قدره ${interestEligibleCumulative.toFixed(2)}`
                });
            }

            if (isPrevious) {
                totalPreviousSubscriptions += currentMonthSubAmount;
                totalPreviousInterest += interestValue;
            } else {
                totalCurrentSubscriptions += currentMonthSubAmount;
                totalCurrentInterest += interestValue;
            }
        }
        
        const totalCombinedInterest = totalPreviousInterest + totalCurrentInterest;
        const finalSettlementAmount = totalPreviousSubscriptions + totalCurrentSubscriptions + totalCombinedInterest;

        // Helper to round to 2 decimal places to avoid floating point issues
        const round = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;

        setCalculationResult({
            totalPreviousSubscriptions: round(totalPreviousSubscriptions),
            totalPreviousInterest: round(totalPreviousInterest),
            totalCurrentSubscriptions: round(totalCurrentSubscriptions),
            totalCurrentInterest: round(totalCurrentInterest),
            totalCombinedInterest: round(totalCombinedInterest),
            finalSettlementAmount: round(finalSettlementAmount),
            detailedBreakdown
        });

    }, [subscriptionPeriods, monthlyRates]);
    
    const handlePrint = () => {
        const element = printRef.current;
        if (!element) return;

        const opt = {
            margin:       [0.5, 0.5, 0.5, 0.5],
            filename:     'settlement_report.pdf',
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 3, useCORS: true, letterRendering: true },
            jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
        };

        const originalTheme = document.documentElement.getAttribute('data-color-scheme');
        document.documentElement.setAttribute('data-color-scheme', 'light');

        setTimeout(() => {
            html2pdf().from(element).set(opt).save().then(() => {
                 if(originalTheme) document.documentElement.setAttribute('data-color-scheme', originalTheme);
            });
        }, 150);
    };
    
    return (
        <div className="bg-[var(--surface-container-low)] border border-[var(--outline-variant)] rounded-3xl shadow-elevation-1 p-6 sm:p-8 transition-colors duration-300">
            <div className="space-y-6">
                {/* --- Input Section --- */}
                <div className="bg-[var(--surface)] p-4 rounded-2xl border border-[var(--outline)]">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-bold text-[var(--on-surface)]">فترات الاشتراك</h3>
                    </div>
                     <div className="overflow-x-auto">
                        <div className="min-w-[800px]">
                            {/* Header */}
                            <div className="grid grid-cols-10 gap-3 px-2 pb-2 border-b border-[var(--outline-variant)]">
                                <span className="col-span-1 font-semibold text-sm text-[var(--on-surface-variant)] text-center">الفترة</span>
                                <span className="col-span-2 font-semibold text-sm text-[var(--on-surface-variant)]">تاريخ بداية الاشتراك</span>
                                <span className="col-span-2 font-semibold text-sm text-[var(--on-surface-variant)]">تاريخ نهاية الاشتراك</span>
                                <span className="col-span-2 font-semibold text-sm text-[var(--on-surface-variant)]">قيمة الاشتراك</span>
                                <span className="col-span-2 font-semibold text-sm text-[var(--on-surface-variant)]">نهاية حساب الفوائد</span>
                                <span className="col-span-1"></span> {/* Action column header */}
                            </div>
                            {/* Rows */}
                            <div className="space-y-2 mt-2">
                                {subscriptionPeriods.map((period, index) => (
                                    <div key={period.id} className="grid grid-cols-10 gap-3 items-center p-2 rounded-lg hover:bg-[var(--surface-container)]">
                                        <label className="col-span-1 text-sm font-medium text-[var(--on-surface-variant)] text-center"> {index + 1}</label>
                                        <div className="col-span-2">
                                            <input type="month" value={period.from} onChange={e => handlePeriodChange(period.id, 'from', e.target.value)} className="input-style" aria-label={`تاريخ بداية الفترة ${index + 1}`}/>
                                        </div>
                                        <div className="col-span-2">
                                            <input type="month" value={period.to} onChange={e => handlePeriodChange(period.id, 'to', e.target.value)} min={period.from} className="input-style" aria-label={`تاريخ نهاية الفترة ${index + 1}`}/>
                                        </div>
                                        <div className="col-span-2">
                                            <input type="number" value={period.amount} onChange={e => handlePeriodChange(period.id, 'amount', e.target.value)} className="input-style" placeholder="قيمة الاشتراك" aria-label={`قيمة اشتراك الفترة ${index + 1}`}/>
                                        </div>
                                        <div className="col-span-2">
                                            <input type="month" value={period.interestEndDate} onChange={e => handlePeriodChange(period.id, 'interestEndDate', e.target.value)} min={period.from} className="input-style" aria-label={`نهاية حساب فوائد الفترة ${index + 1}`}/>
                                        </div>
                                        <div className="col-span-1 flex justify-center">
                                            {subscriptionPeriods.length > 1 && (
                                                <button onClick={() => handleRemovePeriod(period.id)} className="p-2 text-[var(--error)] hover:bg-[var(--error-container)] rounded-full transition-colors" title="إزالة الفترة">
                                                    <DeleteIcon />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                         <button onClick={handleAddPeriod} className="flex items-center gap-2 px-4 py-2 bg-transparent text-[var(--primary)] text-sm font-semibold rounded-full hover:bg-[var(--primary-container)] border border-[var(--outline)] transition-colors">
                            <PlusIcon />
                            <span>إضافة فترة جديدة</span>
                        </button>
                         {lastDeleted && (
                            <button onClick={handleUndoDelete} className="flex items-center gap-2 px-4 py-2 text-sm text-[var(--on-surface-variant)] hover:text-[var(--primary)] transition-colors">
                                <UndoIcon />
                                <span>تراجع عن الحذف</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* --- Actions --- */}
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-wrap gap-4">
                        <button onClick={handleCalculate} className="px-8 py-3 bg-[var(--primary)] text-[var(--on-primary)] font-bold rounded-full shadow-elevation-1 hover:shadow-elevation-2 transition-transform transform hover:-translate-y-0.5">
                            حساب المبالغ الإضافية
                        </button>
                        <button onClick={handleReset} className="px-6 py-3 bg-[var(--surface-container)] text-[var(--on-surface)] font-semibold rounded-full hover:bg-[var(--surface-container-high)] transition-colors">
                            إعادة تعيين
                        </button>
                    </div>
                    <button onClick={() => setRateManagerOpen(true)} className="p-3 bg-[var(--surface-container)] text-[var(--on-surface-variant)] rounded-full hover:bg-[var(--surface-container-high)] hover:text-[var(--primary)] transition-colors" title="إدارة أسعار الفائدة">
                        <CogIcon />
                    </button>
                </div>
                
                {/* --- Results --- */}
                {calculationResult && (
                    <div id="print-area" ref={printRef} className="space-y-6 mt-6 animate-fade-in p-4 bg-[var(--surface)] rounded-2xl border border-[var(--outline)]">
                        {/* Summary */}
                        <div className="p-4 bg-[var(--surface-container)] rounded-2xl">
                             <h3 className="text-lg font-bold text-[var(--on-surface)] mb-4 summary-title">ملخص التسوية</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-center">
                                <SummaryCard label="إجمالي الاشتراكات السابقة" value={calculationResult.totalPreviousSubscriptions.toFixed(2)} />
                                <SummaryCard label="فوائد الاشتراكات السابقة" value={calculationResult.totalPreviousInterest.toFixed(2)} />
                                <SummaryCard label="إجمالي الاشتراكات الحالية" value={calculationResult.totalCurrentSubscriptions.toFixed(2)} />
                                <SummaryCard label="فوائد الاشتراكات الحالية" value={calculationResult.totalCurrentInterest.toFixed(2)} />
                                <SummaryCard label="إجمالي الفوائد المستحقة" value={calculationResult.totalCombinedInterest.toFixed(2)} />
                                <SummaryCard label="إجمالي مبلغ التسوية النهائي" value={calculationResult.finalSettlementAmount.toFixed(2)} isPrimary />
                            </div>
                        </div>
                        
                        {/* Details Table */}
                        <div className="overflow-x-auto">
                            <h3 className="text-lg font-bold text-[var(--on-surface)] my-4 details-title">التفاصيل الشهرية</h3>
                            <table className="w-full text-sm">
                                <thead className="bg-[var(--surface-container)]">
                                    <tr>
                                        <th className="p-3 font-semibold text-right">الشهر</th>
                                        <th className="p-3 font-semibold text-center">قيمة الاشتراك</th>
                                        <th className="p-3 font-semibold text-center">نسبة الفائدة (%)</th>
                                        <th className="p-3 font-semibold text-center">قيمة الفائدة</th>
                                        <th className="p-3 font-semibold text-right">التفاصيل</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {calculationResult.detailedBreakdown.map((row, index) => (
                                        <tr key={index} className={`border-b border-[var(--outline-variant)] ${row.isPrevious ? 'bg-amber-500/10' : ''}`}>
                                            <td className="p-3 font-mono">{row.month}</td>
                                            <td className="p-3 text-center font-mono">{row.amount > 0 ? row.amount.toFixed(2) : '-'}</td>
                                            <td className="p-3 text-center font-mono">{row.rate.toFixed(2)}%</td>
                                            <td className="p-3 text-center font-mono font-semibold text-[var(--primary)]">{row.interestValue.toFixed(2)}</td>
                                            <td className="p-3 text-xs text-[var(--on-surface-variant)]">{row.details}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="text-left mt-4 print-button-container">
                            <button onClick={handlePrint} className="px-6 py-2 bg-transparent text-[var(--primary)] font-semibold rounded-full border border-[var(--outline)] hover:bg-[var(--primary-container)] transition-colors">
                                طباعة التقرير
                            </button>
                        </div>
                    </div>
                )}
            </div>
            
            <RateManagerModal 
                isOpen={isRateManagerOpen}
                onClose={() => setRateManagerOpen(false)}
                rates={monthlyRates}
                onSave={setMonthlyRates}
                currentUser={currentUser}
            />

            <style>{`
                .input-style {
                    width: 100%;
                    padding: 0.6rem 0.8rem;
                    border: 1px solid var(--outline);
                    border-radius: 0.5rem;
                    background-color: var(--surface-container-high);
                    color: var(--on-surface);
                    transition: all 0.2s ease-in-out;
                }
                .input-style:focus {
                    outline: none;
                    border-color: var(--primary);
                    box-shadow: 0 0 0 2px var(--focus-ring);
                }
                .animate-fade-in {
                    animation: fade-in 0.5s ease-out forwards;
                }
                @keyframes fade-in {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                @media print {
                    body * {
                        visibility: hidden;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    #print-area, #print-area * {
                        visibility: visible;
                    }
                    #print-area {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                        font-size: 11pt;
                        color: #000;
                        background: #fff;
                    }
                    .summary-title, .details-title, .print-button-container {
                        display: none;
                    }
                    #print-area div, #print-area table, #print-area tr, #print-area td, #print-area th {
                        background-color: transparent !important;
                        color: #000 !important;
                        box-shadow: none !important;
                    }
                     #print-area table {
                        width: 100%;
                        border-collapse: collapse;
                    }
                    #print-area th, #print-area td {
                        border: 1px solid #999;
                        padding: 6px;
                        text-align: right;
                    }
                    #print-area th {
                        background-color: #eee !important;
                        font-weight: bold;
                    }
                    #print-area .font-mono {
                        font-family: 'Courier New', Courier, monospace;
                        font-size: 12pt;
                        font-weight: bold;
                    }
                    #print-area .text-center {
                        text-align: center;
                    }
                    #print-area .grid {
                        grid-template-columns: repeat(3, 1fr) !important;
                    }
                }
            `}</style>
        </div>
    );
};


// --- Sub-components ---

const SummaryCard: React.FC<{ label: string, value: string, isPrimary?: boolean }> = ({ label, value, isPrimary = false }) => (
    <div className={`p-4 rounded-xl transition-all duration-300 ${isPrimary ? 'bg-[var(--primary-container)] text-[var(--on-primary-container)] shadow-md' : 'bg-[var(--surface)] text-[var(--on-surface)]'}`}>
        <div className="text-sm opacity-80">{label}</div>
        <div className={`font-bold font-mono text-xl mt-1 ${isPrimary ? 'text-[var(--primary)]' : ''}`}>{value}</div>
    </div>
);


const PasswordPrompt: React.FC<{ onConfirm: (password: string) => void, onCancel: () => void }> = ({ onConfirm, onCancel }) => {
    const [password, setPassword] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onConfirm(password);
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-[var(--surface-container-high)] rounded-2xl p-6 w-full max-w-sm shadow-xl">
                <form onSubmit={handleSubmit}>
                    <h4 className="font-bold text-lg text-[var(--on-surface)] mb-4">تأكيد الهوية</h4>
                    <p className="text-sm text-[var(--on-surface-variant)] mb-4">لفتح التعديل، يرجى إدخال كلمة المرور الخاصة بك.</p>
                    <PasswordInput
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="input-style"
                        autoFocus
                    />
                    <div className="flex justify-end gap-4 mt-6">
                        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-full text-[var(--on-surface-variant)] hover:bg-[var(--surface-container)]">إلغاء</button>
                        <button type="submit" className="px-6 py-2 rounded-full bg-[var(--primary)] text-[var(--on-primary)] font-semibold">تأكيد</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

interface RateManagerModalProps {
    isOpen: boolean;
    onClose: () => void;
    rates: MonthlyInterestRate[];
    onSave: (newRates: MonthlyInterestRate[]) => void;
    currentUser: User;
}
const RateManagerModal: React.FC<RateManagerModalProps> = ({ isOpen, onClose, rates, onSave, currentUser }) => {
    const [tempRates, setTempRates] = useState<MonthlyInterestRate[]>(rates);
    const [searchTerm, setSearchTerm] = useState('');
    const [isLocked, setIsLocked] = useState(true);
    const [isPasswordPromptOpen, setPasswordPromptOpen] = useState(false);
    
    const [isBulkUpdateVisible, setBulkUpdateVisible] = useState(false);
    const [bulkUpdatePeriods, setBulkUpdatePeriods] = useState<BulkRatePeriod[]>([createNewBulkRatePeriod()]);

    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setTempRates(JSON.parse(JSON.stringify(rates))); // Deep copy
            setIsLocked(true); // Always start locked
            setSearchTerm('');
            setBulkUpdateVisible(false);
            setBulkUpdatePeriods([createNewBulkRatePeriod()]);
        }
    }, [isOpen, rates]);

    const handlePasswordConfirm = (password: string) => {
        if (password === currentUser.password) {
            setIsLocked(false);
            setPasswordPromptOpen(false);
        } else {
            alert('كلمة المرور غير صحيحة.');
        }
    };

    const handleSave = () => {
        onSave(tempRates);
        onClose();
    };

    const handleRateChange = (date: string, newRate: string) => {
        setTempRates(produce(draft => {
            const rateEntry = draft.find(r => r.date === date);
            if (rateEntry) {
                rateEntry.rate = newRate;
            }
        }));
    };
    
    const handleAddBulkPeriod = () => setBulkUpdatePeriods(p => [...p, createNewBulkRatePeriod()]);
    const handleRemoveBulkPeriod = (id: number) => setBulkUpdatePeriods(p => p.filter(item => item.id !== id));
    const handleBulkPeriodChange = (id: number, field: 'from' | 'to' | 'rate', value: string) => {
        setBulkUpdatePeriods(produce(draft => {
            const period = draft.find(p => p.id === id);
            if (period) (period as any)[field] = value;
        }));
    };

    const handleApplyBulkUpdate = () => {
        if(bulkUpdatePeriods.some(p => !p.from || !p.to || !p.rate)) {
            alert("يرجى ملء جميع حقول فترات التعديل الجماعي.");
            return;
        }

        setTempRates(produce(draft => {
            for (const period of bulkUpdatePeriods) {
                let current = new Date(`${period.from}-01T00:00:00Z`);
                const end = new Date(`${period.to}-01T00:00:00Z`);
                
                while (current.getTime() <= end.getTime()) {
                    const monthKey = current.toISOString().slice(0, 7);
                    const rateEntry = draft.find(r => r.date === monthKey);
                    if (rateEntry) {
                        rateEntry.rate = period.rate;
                    } else {
                        // Optionally add new rate if it doesn't exist
                        // draft.push({ date: monthKey, rate: period.rate });
                    }
                    current.setUTCMonth(current.getUTCMonth() + 1);
                }
            }
        }));

        alert('تم تطبيق التعديل الجماعي. اضغط "حفظ التغييرات" لتأكيد.');
    };

    const handleImportClick = () => {
        if(confirm("هل تريد استيراد ملف؟ سيتم فقدان التغييرات الحالية.")) {
            fileInputRef.current?.click();
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                if (typeof ev.target?.result === 'string') {
                    const json = JSON.parse(ev.target.result);
                    // Basic validation
                    if (Array.isArray(json) && json.every(item => typeof item === 'object' && item !== null && 'date' in item && 'rate' in item)) {
                        setTempRates(json as MonthlyInterestRate[]);
                        setSearchTerm(''); // Clear filter to show imported data
                        alert("تم استيراد البيانات بنجاح.");
                    } else {
                        alert("ملف غير صالح أو لا يطابق التنسيق المطلوب (قائمة من التواريخ والنسب).");
                    }
                }
            } catch (err) {
                console.error(err);
                alert("حدث خطأ أثناء قراءة الملف. تأكد من أنه ملف JSON صالح.");
            }
        };
        reader.readAsText(file);
        
        // Reset input value to allow selecting the same file again
        e.target.value = '';
    };

    const filteredRates = tempRates.filter(r => r.date.includes(searchTerm));

    if (!isOpen) return null;

    return (
        <>
        <div className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-[var(--surface-container-high)] border border-[var(--outline)] rounded-3xl shadow-elevation-5 w-full max-w-5xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                <header className="flex items-center justify-between p-4 border-b border-[var(--outline-variant)]">
                    <h3 className="text-xl font-bold text-[var(--on-surface)]">إدارة أسعار الفائدة الشهرية</h3>
                    <button onClick={onClose} className="p-2 rounded-full text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-highest)]"><CloseIcon /></button>
                </header>
                
                <div className="p-4 bg-[var(--surface-container)] border-b border-[var(--outline-variant)] space-y-3">
                    <div className="flex flex-wrap gap-4 items-center">
                        <div className="relative flex-grow">
                             <input type="search" placeholder="ابحث عن تاريخ (YYYY-MM)..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="input-style w-full pl-10" />
                             <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--on-surface-variant)] w-5 h-5 z-10" />
                        </div>
                        <button onClick={() => isLocked ? setPasswordPromptOpen(true) : setIsLocked(true)} className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-colors bg-[var(--surface)] hover:bg-[var(--surface-container-high)]" title={isLocked ? "فتح التعديل" : "قفل التعديل"}>
                            {isLocked ? <LockClosedIcon className="text-red-500"/> : <LockOpenIcon className="text-green-500" />}
                            <span>{isLocked ? 'مغلق للتعديل' : 'مفتوح للتعديل'}</span>
                        </button>
                    </div>
                     {!isLocked && (
                        <div className="flex flex-wrap gap-3 items-center text-sm">
                             <button onClick={() => setBulkUpdateVisible(v => !v)} className="px-4 py-1.5 rounded-full bg-[var(--tertiary-container)] text-[var(--on-tertiary-container)] font-medium">التعديل الجماعي للمدد</button>
                            
                            {/* Import Button */}
                            <button onClick={handleImportClick} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-[var(--surface-container-high)]">
                                <FileDownloadIcon/> استيراد
                            </button>
                            
                            {/* Export Button */}
                            <button onClick={() => { const blob = new Blob([JSON.stringify(tempRates, null, 2)], {type: "application/json"}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'interest-rates.json'; a.click(); URL.revokeObjectURL(url); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-[var(--surface-container-high)]">
                                <FileUploadIcon/> تصدير
                            </button>
                            
                            {/* Reset Button */}
                            <button onClick={() => { if(confirm("هل أنت متأكد من إعادة تعيين جميع النسب إلى الوضع الافتراضي؟")) { setTempRates(JSON.parse(JSON.stringify(DEFAULT_MONTHLY_RATES))); setSearchTerm(''); }}} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-amber-700 dark:text-amber-400 hover:bg-amber-500/10">
                                <RefreshIcon/> إعادة للوضع الافتراضي
                            </button>
                        </div>
                    )}
                </div>

                {/* Hidden Input for File Upload - Moved outside conditional block to ensure ref is always attached */}
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    accept=".json" 
                    className="hidden" 
                    onChange={handleFileChange} 
                />

                {isBulkUpdateVisible && !isLocked && (
                    <div className="p-4 border-b border-[var(--outline-variant)] bg-blue-500/5 space-y-3 animate-fade-in">
                        <h4 className="font-semibold text-[var(--primary)]">تعديل جماعي</h4>
                        <div className="space-y-2">
                             {bulkUpdatePeriods.map((p, i) => (
                                <div key={p.id} className="grid grid-cols-8 gap-2 items-center">
                                    <input type="month" value={p.from} onChange={e => handleBulkPeriodChange(p.id, 'from', e.target.value)} className="input-style col-span-3"/>
                                    <input type="month" value={p.to} onChange={e => handleBulkPeriodChange(p.id, 'to', e.target.value)} className="input-style col-span-3"/>
                                    <input type="number" step="0.01" placeholder="%" value={p.rate} onChange={e => handleBulkPeriodChange(p.id, 'rate', e.target.value)} className="input-style col-span-1"/>
                                    <div className="col-span-1 flex justify-center">
                                        {i === 0 ? <button onClick={handleAddBulkPeriod} className="p-1 text-green-500"><PlusIcon/></button> : <button onClick={() => handleRemoveBulkPeriod(p.id)} className="p-1 text-red-500"><DeleteIcon/></button>}
                                    </div>
                                </div>
                             ))}
                        </div>
                        <button onClick={handleApplyBulkUpdate} className="px-4 py-1.5 text-sm font-semibold rounded-full bg-[var(--primary)] text-[var(--on-primary)]">تطبيق التعديل</button>
                    </div>
                )}
                
                <div className="flex-grow overflow-y-auto p-4">
                     <table className="w-full text-sm">
                        <thead className="bg-[var(--surface)] sticky top-0 z-10">
                            <tr>
                                <th className="p-2 font-semibold text-right text-[var(--on-surface-variant)] border-b-2 border-[var(--outline)]">التاريخ</th>
                                <th className="p-2 font-semibold text-center text-[var(--on-surface-variant)] border-b-2 border-[var(--outline)]">نسبة الفائدة (%)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRates.map(rate => (
                                <tr key={rate.date} className="border-b border-[var(--outline-variant)] hover:bg-[var(--surface)]">
                                    <td className="p-2 font-mono text-[var(--on-surface-variant)]">{rate.date}</td>
                                    <td className="p-1 w-40">
                                        <input 
                                            type="number" 
                                            step="0.01" 
                                            value={rate.rate}
                                            onChange={(e) => handleRateChange(rate.date, e.target.value)}
                                            disabled={isLocked}
                                            className="input-style text-center font-semibold w-full disabled:bg-transparent disabled:border-transparent disabled:text-[var(--on-surface)]"
                                            aria-label={`نسبة الفائدة لشهر ${rate.date}`}
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <footer className="flex justify-end gap-4 p-4 bg-[var(--surface-container)] border-t border-[var(--outline-variant)]">
                    <button onClick={onClose} className="px-6 py-2 rounded-full text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-high)]">إغلاق</button>
                    <button onClick={handleSave} disabled={isLocked} className="px-8 py-2 rounded-full bg-[var(--primary)] text-[var(--on-primary)] font-semibold disabled:opacity-50 disabled:cursor-not-allowed">حفظ التغييرات</button>
                </footer>
            </div>
        </div>
        {isPasswordPromptOpen && <PasswordPrompt onConfirm={handlePasswordConfirm} onCancel={() => setPasswordPromptOpen(false)} />}
        </>
    );
};

export default AdditionalAmountsCalculator;
