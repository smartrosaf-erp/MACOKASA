export const publicSources = [
  {
    title: "Only 0.35% kabaza operators registered",
    publisher: "The Times Group",
    url: "https://times.mw/0-35-kabaza-operators-registered/",
    fact: "The article reports 2,578,909 motorcycles and 7,912 registered with MACOKASA."
  },
  {
    title: "MACOKASA in kabaza awareness campaign",
    publisher: "Malawi News Agency",
    url: "https://manaonline.gov.mw/index.php?Itemid=412&id=6065%3Amacokasa-in-kabaza-awareness-campaign&option=com_k2&view=item",
    fact: "MACOKASA has conducted road safety awareness on helmets, reflectors, safety shoes, one passenger, and training engagement."
  },
  {
    title: "Fresh drive to tame Kabaza",
    publisher: "Nation Online",
    url: "https://mwnation.com/fresh-drive-to-tame-kabaza/",
    fact: "MACOKASA and Malawi Police Service teamed up to bring sanity among kabaza operators and enforce safety compliance."
  },
  {
    title: "Despite many accidents, Malawians still prefer Kabaza",
    publisher: "Nyasa Times",
    url: "https://www.nyasatimes.com/despite-many-accidents-malawians-still-prefer-kabaza/",
    fact: "MACOKASA leadership has advocated for regulation, lower licence fees, and helmet use."
  }
];

export const districts = [
  "Balaka", "Blantyre", "Chikwawa", "Chiradzulu", "Chitipa", "Dedza", "Dowa", "Karonga",
  "Kasungu", "Likoma", "Lilongwe", "Machinga", "Mangochi", "Mchinji", "Mulanje", "Mwanza",
  "Mzimba", "Neno", "Nkhata Bay", "Nkhotakota", "Nsanje", "Ntcheu", "Ntchisi", "Phalombe",
  "Rumphi", "Salima", "Thyolo", "Zomba"
];

export const membershipPlans = [
  {
    key: "regular",
    name: "Regular",
    audience: "Operator",
    annualFee: 15000,
    color: "#10b91f",
    benefits: ["National membership record", "Renewal reminders", "Public QR verification", "ROSAF training discount eligibility"]
  },
  {
    key: "silver",
    name: "Silver",
    audience: "Operator",
    annualFee: 30000,
    color: "#b8c0cc",
    benefits: ["All Regular benefits", "Priority ID card queue", "Safety compliance badge", "Owner matching visibility"]
  },
  {
    key: "gold",
    name: "Gold",
    audience: "Operator",
    annualFee: 55000,
    color: "#f4c400",
    benefits: ["All Silver benefits", "Reduced refresher training fees", "Rank promotion as safer operator", "Complaints resolution support"]
  },
  {
    key: "platinum",
    name: "Platinum",
    audience: "Operator",
    annualFee: 90000,
    color: "#e5e4e2",
    benefits: ["All Gold benefits", "Tracker installation eligibility", "Fleet-owner priority matching", "Premium digital profile"]
  },
  {
    key: "owner_basic",
    name: "Owner Basic",
    audience: "Motorcycle Owner",
    annualFee: 45000,
    color: "#0075bd",
    benefits: ["Owner portal", "Motorcycle mapping", "Operator agreement records", "Basic earnings and expense tracking"]
  },
  {
    key: "owner_fleet",
    name: "Owner Fleet",
    audience: "Motorcycle Owner",
    annualFee: 120000,
    color: "#111827",
    benefits: ["All Owner Basic benefits", "Multi-bike fund dashboard", "Operator behavior notifications", "Complaints feedback workflow"]
  }
];

export const paymentMethods = ["AirtelMoney", "Mpamba", "Bank Card", "Bank Transfer", "Cash"];
export const reminderDays = [28, 14, 7, 3, 2, 1];

export const affiliatedMembers = ["ROSAF", "KATAMAS", "KAMA"];
export const stakeholders = ["DRTSS", "MPS", "Local government", "Ministry of Transport"];

export const demoState = {
  impact: {
    estimatedFleet: 2800000,
    reportedMotorcycles: 2578909,
    registeredOperators: 7912,
    registeredMotorcycles: 6840,
    subscribedOwners: 1265,
    targetRegistrationShare: 70,
    districtsReached: 7,
    trainingPartners: ["ROSAF", "Lilongwe City Council", "Malawi Police Service", "City councils", "Printing partners"]
  },
  operators: [
    {
      id: "op-001",
      membershipNumber: "MCK-LL-2026-0001",
      fullName: "Joseph Banda",
      phone: "+265 991 230 111",
      email: "joseph.banda@example.com",
      nationalId: "MW-LL-000001",
      operatorCategory: "Motorcycle operator",
      sex: "Male",
      district: "Lilongwe",
      operatingArea: "Area 25 Rank",
      membershipPlan: "gold",
      membershipType: "operator",
      expiresOn: "2026-07-22",
      hasLicense: true,
      licenseNumber: "DL-LL-42101",
      ownershipStatus: "Rents motorcycle",
      motorcycleId: "bike-001",
      helmetUse: true,
      passengerHelmet: true,
      licensePlate: "LL 8421",
      trackerInstalled: false,
      status: "active",
      photoData: "",
      createdAt: "2026-01-11"
    },
    {
      id: "op-002",
      membershipNumber: "MCK-BT-2026-0002",
      fullName: "Madalitso Jere",
      phone: "+265 888 450 222",
      email: "madalitso.jere@example.com",
      nationalId: "MW-BT-000002",
      operatorCategory: "Bicycle operator",
      sex: "Female",
      district: "Blantyre",
      operatingArea: "Clock Tower",
      membershipPlan: "regular",
      membershipType: "operator",
      expiresOn: "2026-07-08",
      hasLicense: false,
      licenseNumber: "",
      ownershipStatus: "Owns motorcycle",
      motorcycleId: "bike-002",
      helmetUse: true,
      passengerHelmet: false,
      licensePlate: "BT 3402",
      trackerInstalled: false,
      status: "training due",
      photoData: "",
      createdAt: "2026-02-03"
    },
    {
      id: "op-003",
      membershipNumber: "MCK-MZ-2026-0003",
      fullName: "Allan Faison",
      phone: "+265 999 120 887",
      email: "allan.faison@example.com",
      nationalId: "MW-MZ-000003",
      operatorCategory: "Motorcycle operator",
      sex: "Male",
      district: "Mzuzu",
      operatingArea: "Mzuzu Depot",
      membershipPlan: "platinum",
      membershipType: "operator",
      expiresOn: "2026-11-18",
      hasLicense: true,
      licenseNumber: "DL-MZ-91233",
      ownershipStatus: "Rents motorcycle",
      motorcycleId: "bike-003",
      helmetUse: true,
      passengerHelmet: true,
      licensePlate: "MZ 7728",
      trackerInstalled: true,
      status: "active",
      photoData: "",
      createdAt: "2026-02-19"
    }
  ],
  owners: [
    {
      id: "owner-001",
      ownerNumber: "OWN-LL-0001",
      fullName: "Grace Phiri",
      phone: "+265 997 800 123",
      email: "grace.phiri@example.com",
      district: "Lilongwe",
      plan: "owner_fleet",
      expiresOn: "2027-01-30",
      status: "active"
    },
    {
      id: "owner-002",
      ownerNumber: "OWN-BT-0002",
      fullName: "Frank Staford",
      phone: "+265 884 610 912",
      email: "frank.staford@example.com",
      district: "Blantyre",
      plan: "owner_basic",
      expiresOn: "2026-08-30",
      status: "active"
    }
  ],
  motorcycles: [
    {
      id: "bike-001",
      ownerId: "owner-001",
      plateNumber: "LL 8421",
      make: "Bajaj Boxer",
      trackerEligible: true,
      trackerInstalled: false,
      helmetCount: 2,
      assignedOperatorId: "op-001",
      agreementType: "Target based",
      monthlyTarget: 180000,
      monthlyPay: 0
    },
    {
      id: "bike-002",
      ownerId: "owner-002",
      plateNumber: "BT 3402",
      make: "TVS HLX",
      trackerEligible: false,
      trackerInstalled: false,
      helmetCount: 1,
      assignedOperatorId: "op-002",
      agreementType: "Monthly pay",
      monthlyTarget: 0,
      monthlyPay: 120000
    },
    {
      id: "bike-003",
      ownerId: "owner-001",
      plateNumber: "MZ 7728",
      make: "Honda ACE",
      trackerEligible: true,
      trackerInstalled: true,
      helmetCount: 2,
      assignedOperatorId: "op-003",
      agreementType: "Target based",
      monthlyTarget: 220000,
      monthlyPay: 0
    }
  ],
  payments: [
    {
      id: "pay-001",
      payerName: "Joseph Banda",
      payerType: "operator",
      membershipNumber: "MCK-LL-2026-0001",
      method: "AirtelMoney",
      amount: 55000,
      purpose: "Gold annual subscription",
      collectorName: "",
      reference: "AM-884201",
      status: "reconciled",
      createdAt: "2026-01-11"
    },
    {
      id: "pay-002",
      payerName: "Madalitso Jere",
      payerType: "operator",
      membershipNumber: "MCK-BT-2026-0002",
      method: "Cash",
      amount: 15000,
      purpose: "Regular annual subscription",
      collectorName: "MACOKASA Blantyre Treasurer",
      reference: "CASH-BT-011",
      status: "awaiting deposit",
      createdAt: "2026-02-03"
    }
  ],
  cards: [
    {
      id: "card-001",
      operatorId: "op-001",
      cardNumber: "CARD-MCK-0001",
      qrToken: "qr-op-001-20260111",
      status: "active",
      membershipPlan: "gold",
      issuedAt: "2026-01-12",
      replacedBy: ""
    },
    {
      id: "card-002",
      operatorId: "op-002",
      cardNumber: "CARD-MCK-0002",
      qrToken: "qr-op-002-20260203",
      status: "active",
      membershipPlan: "regular",
      issuedAt: "2026-02-05",
      replacedBy: ""
    }
  ],
  cooperatives: [
    {
      id: "coop-001",
      name: "Lilongwe Safer Riders Cooperative",
      district: "Lilongwe",
      members: 34,
      requestedMotorcycles: 12,
      loanAmount: 18500000,
      guarantorStatus: "MACOKASA review",
      bankPartner: "Pending partner bank"
    }
  ],
  fundEntries: [
    {
      id: "fund-001",
      ownerId: "owner-001",
      motorcycleId: "bike-001",
      type: "income",
      amount: 45000,
      note: "Week 1 target collection",
      createdAt: "2026-06-03"
    },
    {
      id: "fund-002",
      ownerId: "owner-001",
      motorcycleId: "bike-001",
      type: "expense",
      amount: 12000,
      note: "Service and chain replacement",
      createdAt: "2026-06-06"
    },
    {
      id: "fund-003",
      ownerId: "owner-002",
      motorcycleId: "bike-002",
      type: "income",
      amount: 120000,
      note: "Monthly operator payment",
      createdAt: "2026-06-01"
    }
  ],
  donations: [
    {
      id: "don-001",
      donorName: "Road Safety Supporter",
      amount: 250000,
      method: "Bank Transfer",
      purpose: "Helmet safety campaign",
      createdAt: "2026-05-18"
    }
  ],
  financeEntries: [
    {
      id: "fin-003",
      type: "expense",
      category: "Training support",
      source: "ROSAF safe riding course",
      amount: 120000,
      method: "Bank Transfer",
      reference: "EXP-TRN-001",
      recordedBy: "Finance Officer",
      notes: "Operator refresher training support",
      createdAt: "2026-06-05"
    },
    {
      id: "fin-004",
      type: "expense",
      category: "Card printing",
      source: "ID card production",
      amount: 45000,
      method: "Cash",
      reference: "EXP-CARD-001",
      recordedBy: "Printing Desk",
      notes: "Initial PVC card batch",
      createdAt: "2026-06-10"
    }
  ],
  stories: [
    {
      id: "editorial-government-2026",
      title: "Government engagement keeps registration, licensing, and rank safety on one agenda",
      category: "Government engagement",
      location: "National coordination",
      partners: ["Ministry of Transport", "DRTSS", "Malawi Police Service", "Local government"],
      impactLine: "One shared information picture helps institutions coordinate policy, enforcement, training, and district action.",
      summary: "MACOKASA is bringing public institutions and Kabaza leadership around a practical agenda for operator registration, licensing support, safer ranks, and reliable sector data.",
      body: "Formalising the Kabaza sector requires more than a registration form. Transport authorities need dependable information for policy and licensing, police need a clear route for verification and safety engagement, and councils need district and rank-level records for planning.\nMACOKASA's stakeholder platform connects these responsibilities. The coalition can use the same operator, motorcycle, training, and membership picture to guide dialogue with the Ministry of Transport, DRTSS, the Malawi Police Service, and local government.\nThe result is a clearer path from national decisions to rank-level action: operators know what is expected, committees can support registration, and institutions can see where safety and licensing attention is most urgent.",
      images: ["./assets/macokasa-rider-training.jpg", "./assets/kabaza-safety-mobilisation.jpg"],
      imageData: "./assets/macokasa-rider-training.jpg",
      status: "published",
      createdAt: "2026-07-22"
    },
    {
      id: "editorial-safety-2026",
      title: "Rank mobilisation turns road-safety awareness into daily practice",
      category: "Safety campaign",
      location: "District Kabaza ranks",
      partners: ["MACOKASA district committees", "Rank chairpersons", "Malawi Police Service"],
      impactLine: "Safety messages become more useful when rank leaders can follow up with identified, registered operators.",
      summary: "District and rank committees are mobilising riders around helmets, reflectors, one-passenger practice, motorcycle identification, and responsible conduct.",
      body: "A safety campaign is strongest when operators hear the message from people they work with every day. MACOKASA's district and rank structure gives awareness work a local route, allowing committees to organise riders, record participation, and keep safety conversations active after a public event ends.\nMobilisation focuses on practical choices: wearing a helmet, carrying one passenger, using visible protective gear, keeping motorcycles identifiable, and responding when a passenger or owner raises a concern.\nAs operators register, the MACOKASA IMS helps committees understand who has received information, who needs training or licence support, and where another mobilisation session should be prioritised.",
      images: ["./assets/kabaza-safety-mobilisation.jpg", "./assets/macokasa-road-safety-training.jpg", "./assets/rosaf-road-safety-practical.jpg"],
      imageData: "./assets/kabaza-safety-mobilisation.jpg",
      status: "published",
      createdAt: "2026-07-21"
    },
    {
      id: "editorial-training-2026",
      title: "ROSAF partnership links MACOKASA membership to practical rider training",
      category: "Training",
      location: "Lilongwe",
      partners: ["ROSAF", "MACOKASA"],
      impactLine: "Membership becomes a pathway to practical skills, refresher learning, and support towards formal licensing.",
      summary: "Through ROSAF, registered members can access reduced-fee training support that turns road-safety messages into supervised riding practice.",
      body: "Many Kabaza operators enter the sector as a livelihood before they have access to formal riding instruction. The partnership with ROSAF helps MACOKASA respond with a practical pathway rather than leaving members to navigate training and licensing alone.\nTraining can cover controlled riding, observation, road position, protective equipment, passenger safety, and the habits needed to prepare for formal licensing. Refresher courses also give experienced operators a chance to correct unsafe habits.\nBy connecting participation to the membership record, MACOKASA can recognise trained riders, identify those still waiting for support, and report progress to partners without losing the human story behind the data.",
      images: ["./assets/rosaf-road-safety-practical.jpg", "./assets/macokasa-road-safety-training.jpg", "./assets/kabaza-safety-mobilisation.jpg"],
      imageData: "./assets/rosaf-road-safety-practical.jpg",
      status: "published",
      createdAt: "2026-07-19"
    },
    {
      id: "editorial-districts-2026",
      title: "District committees bring registration closer to operators",
      category: "District registration",
      location: "Across participating districts",
      partners: ["MACOKASA district committees", "Regional committees"],
      impactLine: "Local registration support reduces distance, builds trust, and improves the quality of operator records.",
      summary: "District committees are coordinating with regional leadership so pedal and motorcycle taxi operators can register through people who understand their ranks and communities.",
      body: "National formalisation depends on local relationships. District committees can organise registration points, confirm operating areas, explain membership and ID processes, and help operators prepare the information required for a complete record.\nRegional committees provide coordination across districts, helping MACOKASA maintain consistent standards while responding to local operating realities.\nThis structure also makes follow-up possible. Where a member still needs a licence, training, helmet support, or a corrected ID record, the issue can be routed through a committee that already knows the area.",
      images: ["./assets/macokasa-rider-training.jpg", "./assets/macokasa-road-safety-training.jpg"],
      imageData: "./assets/macokasa-rider-training.jpg",
      status: "published",
      createdAt: "2026-07-15"
    },
    {
      id: "editorial-owners-2026",
      title: "Verified operator records give motorcycle owners a clearer business picture",
      category: "Owner impact",
      location: "Owner portal",
      partners: ["Motorcycle owners", "MACOKASA"],
      impactLine: "A motorcycle can be linked to an identified operator, an agreed payment model, and a dated income and expense record.",
      summary: "Owners can map motorcycles to verified operators and compare performance bike by bike without MACOKASA taking custody of their funds.",
      body: "For an owner managing several motorcycles, notebooks and verbal agreements can make it difficult to see which bike is performing well and where costs are rising.\nThe MACOKASA owner portal keeps the agreement, assigned operator, income, expense, and transaction date together. Owners can select an individual motorcycle, see its balance, and retain a clearer history for business decisions.\nThe platform does not hold owner funds. Its purpose is to improve accountability, support better operator relationships, and help owners identify problems early.",
      images: ["./assets/macokasa-rider-training.jpg"],
      imageData: "./assets/macokasa-rider-training.jpg",
      status: "published",
      createdAt: "2026-07-11"
    },
    {
      id: "editorial-participation-2026",
      title: "Recording sex participation makes women in the sector visible",
      category: "Member story",
      location: "MACOKASA IMS",
      partners: ["MACOKASA membership committees"],
      impactLine: "Better participation data can guide outreach, training access, and a more inclusive formalisation effort.",
      summary: "Registration now records sex participation so MACOKASA can understand where women are working in pedal and motorcycle transport and where support is needed.",
      body: "Women working in and around the Kabaza sector can be overlooked when records focus only on motorcycles and payments. Capturing sex participation gives MACOKASA a clearer picture of who is entering the sector and whether women are reaching membership, training, and ownership opportunities.\nThe information can support targeted mobilisation, safer-work conversations, and partner reporting. It also helps leadership move from assumptions to evidence when planning inclusive programmes.",
      images: ["./assets/macokasa-road-safety-training.jpg"],
      imageData: "./assets/macokasa-road-safety-training.jpg",
      status: "published",
      createdAt: "2026-07-08"
    }
  ],
  storyTombstones: [],
  reminderLogs: []
};
