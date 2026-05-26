// Pre-geocoded delivery addresses across real Alicante neighborhoods.
// Coords are approximate but realistic - good enough for hackathon demo.

export type SeedAddress = {
  street: string;
  number: string;
  postalCode: string;
  lat: number;
  lng: number;
  district: string;
};

export const ALICANTE_ADDRESSES: SeedAddress[] = [
  // Centro
  { street: "Avenida de Maisonnave", number: "12", postalCode: "03003", lat: 38.3450, lng: -0.4830, district: "Centro" },
  { street: "Calle Castaños", number: "8", postalCode: "03001", lat: 38.3480, lng: -0.4840, district: "Centro" },
  { street: "Rambla Méndez Núñez", number: "22", postalCode: "03002", lat: 38.3455, lng: -0.4845, district: "Centro" },
  { street: "Calle San Francisco", number: "35", postalCode: "03001", lat: 38.3458, lng: -0.4825, district: "Centro" },
  { street: "Avenida Alfonso X El Sabio", number: "18", postalCode: "03002", lat: 38.3465, lng: -0.4860, district: "Centro" },
  { street: "Avenida de la Estación", number: "5", postalCode: "03003", lat: 38.3490, lng: -0.4840, district: "Centro" },
  { street: "Calle Bailén", number: "9", postalCode: "03001", lat: 38.3473, lng: -0.4810, district: "Centro" },
  { street: "Calle del Teatro", number: "14", postalCode: "03001", lat: 38.3465, lng: -0.4801, district: "Centro" },

  // Playa San Juan
  { street: "Avenida Costablanca", number: "120", postalCode: "03540", lat: 38.3820, lng: -0.4310, district: "Playa San Juan" },
  { street: "Avenida Naciones", number: "45", postalCode: "03540", lat: 38.3775, lng: -0.4330, district: "Playa San Juan" },
  { street: "Avenida Niza", number: "78", postalCode: "03540", lat: 38.3782, lng: -0.4319, district: "Playa San Juan" },
  { street: "Calle Berlín", number: "12", postalCode: "03540", lat: 38.3795, lng: -0.4290, district: "Playa San Juan" },
  { street: "Avenida Holanda", number: "33", postalCode: "03540", lat: 38.3810, lng: -0.4275, district: "Playa San Juan" },
  { street: "Avenida Conde Lumiares", number: "60", postalCode: "03540", lat: 38.3760, lng: -0.4345, district: "Playa San Juan" },

  // Albufereta
  { street: "Avenida Costa Blanca", number: "92", postalCode: "03540", lat: 38.3717, lng: -0.4377, district: "Albufereta" },
  { street: "Calle Tuna", number: "5", postalCode: "03016", lat: 38.3705, lng: -0.4395, district: "Albufereta" },
  { street: "Calle Cardenal Belluga", number: "11", postalCode: "03016", lat: 38.3690, lng: -0.4420, district: "Albufereta" },
  { street: "Avenida Periodista Rodolfo Salazar", number: "14", postalCode: "03016", lat: 38.3725, lng: -0.4360, district: "Albufereta" },

  // Vistahermosa
  { street: "Avenida Pintor Baeza", number: "22", postalCode: "03010", lat: 38.3661, lng: -0.4660, district: "Vistahermosa" },
  { street: "Calle Caracas", number: "8", postalCode: "03010", lat: 38.3640, lng: -0.4680, district: "Vistahermosa" },
  { street: "Calle Bogotá", number: "17", postalCode: "03010", lat: 38.3625, lng: -0.4695, district: "Vistahermosa" },
  { street: "Avenida Vistahermosa", number: "30", postalCode: "03015", lat: 38.3589, lng: -0.4691, district: "Vistahermosa" },

  // San Blas
  { street: "Avenida General Marvá", number: "10", postalCode: "03004", lat: 38.3556, lng: -0.4948, district: "San Blas" },
  { street: "Calle Pardo Gimeno", number: "24", postalCode: "03007", lat: 38.3540, lng: -0.4960, district: "San Blas" },
  { street: "Avenida de Jijona", number: "7", postalCode: "03007", lat: 38.3570, lng: -0.4935, district: "San Blas" },
  { street: "Calle Italia", number: "44", postalCode: "03003", lat: 38.3410, lng: -0.4925, district: "San Blas" },

  // Carolinas
  { street: "Calle Pintor Murillo", number: "16", postalCode: "03005", lat: 38.3475, lng: -0.4790, district: "Carolinas" },
  { street: "Avenida Padre Esplá", number: "55", postalCode: "03013", lat: 38.3550, lng: -0.4830, district: "Carolinas" },
  { street: "Calle Pintor Velázquez", number: "9", postalCode: "03005", lat: 38.3500, lng: -0.4790, district: "Carolinas" },
  { street: "Calle Cataluña", number: "21", postalCode: "03012", lat: 38.3565, lng: -0.4815, district: "Carolinas" },

  // Benalúa
  { street: "Avenida Doctor Gadea", number: "27", postalCode: "03001", lat: 38.3420, lng: -0.4858, district: "Benalúa" },
  { street: "Calle Alemania", number: "15", postalCode: "03003", lat: 38.3370, lng: -0.4910, district: "Benalúa" },
  { street: "Calle Foglietti", number: "8", postalCode: "03002", lat: 38.3395, lng: -0.4880, district: "Benalúa" },
  { street: "Avenida Salamanca", number: "39", postalCode: "03003", lat: 38.3480, lng: -0.4870, district: "Benalúa" },

  // Garbinet
  { street: "Calle Garbinet", number: "14", postalCode: "03015", lat: 38.3851, lng: -0.5070, district: "Garbinet" },
  { street: "Avenida de Denia", number: "100", postalCode: "03015", lat: 38.3815, lng: -0.5040, district: "Garbinet" },
  { street: "Calle Pintor Lozano", number: "5", postalCode: "03015", lat: 38.3840, lng: -0.5085, district: "Garbinet" },

  // Babel
  { street: "Avenida del Mediterráneo", number: "18", postalCode: "03007", lat: 38.3320, lng: -0.4960, district: "Babel" },
  { street: "Calle Juan de la Cierva", number: "6", postalCode: "03007", lat: 38.3308, lng: -0.4990, district: "Babel" },
  { street: "Calle Industrias", number: "12", postalCode: "03007", lat: 38.3298, lng: -0.5020, district: "Babel" },

  // Florida Alta
  { street: "Calle Doctor Pérez Mateos", number: "11", postalCode: "03007", lat: 38.3415, lng: -0.5060, district: "Florida" },
  { street: "Avenida de Aguilera", number: "53", postalCode: "03007", lat: 38.3445, lng: -0.5005, district: "Florida" },
  { street: "Calle Manuel Antón", number: "14", postalCode: "03007", lat: 38.3430, lng: -0.5030, district: "Florida" },

  // Pla
  { street: "Calle Capitán Hernández Mira", number: "8", postalCode: "03013", lat: 38.3590, lng: -0.4920, district: "Pla" },
  { street: "Calle José Cano Ferre", number: "22", postalCode: "03013", lat: 38.3605, lng: -0.4905, district: "Pla" },
  { street: "Calle Alona", number: "5", postalCode: "03013", lat: 38.3580, lng: -0.4880, district: "Pla" },

  // Altozano
  { street: "Avenida General Marvá", number: "65", postalCode: "03004", lat: 38.3625, lng: -0.4910, district: "Altozano" },
  { street: "Calle López Torregrosa", number: "9", postalCode: "03004", lat: 38.3520, lng: -0.4855, district: "Altozano" },

  // Polígono
  { street: "Calle Severo Ochoa", number: "3", postalCode: "03007", lat: 38.3250, lng: -0.5040, district: "Pla-Carolinas" },
  { street: "Calle Antonio Sequeros", number: "18", postalCode: "03014", lat: 38.3265, lng: -0.5060, district: "Pla-Carolinas" },
];

export const CUSTOMER_NAMES = [
  "Carmen Pérez García", "Antonio López Martín", "María José Sánchez", "José Antonio Ruiz",
  "Ana Belén Fernández", "Francisco Jiménez", "Laura Martínez Soler", "Carlos Navarro",
  "Isabel Romero Vidal", "Manuel García López", "Lucía Hernández", "Javier Torres Mora",
  "Patricia Domínguez", "Daniel Pérez Ortiz", "Cristina Marín", "Sergio Aznar",
  "Beatriz Climent", "Roberto Esteve", "Sandra Galiana", "Pablo Quiles",
  "Marta Pastor", "Rubén Valero", "Elena Ribera", "Adrián Beltrán",
  "Nuria Vives", "Ignacio Soler", "Raquel Bernabéu", "Víctor Bonet",
  "Silvia Mira", "Andrés Lillo",
];

export const DEPOT = { lat: 38.3460, lng: -0.4907, address: "Avenida Aguilera 30, Alicante (Depósito Central)" };
