# Dashboard de Seguimiento de Rutas y KPIs Comerciales# React + TypeScript + Vite



Proyecto fullstack para visualizar rutas, KPIs y datos comerciales.This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.



## Estructura del ProyectoCurrently, two official plugins are available:

```

/- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh

├── backend/          # FastAPI + PostgreSQL- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

├── frontend/         # React + Vite + TailwindCSS

└── docker-compose.yml # Orquestación de servicios## Expanding the ESLint configuration

```

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

## Stack Tecnológico

```js

### Backendexport default tseslint.config([

- **FastAPI**: Framework web rápido para Python  globalIgnores(['dist']),

- **PostgreSQL**: Base de datos relacional  {

- **SQLAlchemy**: ORM para Python    files: ['**/*.{ts,tsx}'],

- **Docker**: Containerización    extends: [

      // Other configs...

### Frontend

- **React + Vite**: Framework frontend moderno      // Remove tseslint.configs.recommended and replace with this

- **TypeScript**: Tipado estático      ...tseslint.configs.recommendedTypeChecked,

- **TailwindCSS**: Framework CSS utilitario      // Alternatively, use this for stricter rules

- **Recharts**: Librería de gráficos      ...tseslint.configs.strictTypeChecked,

- **Mapbox GL JS**: Mapas interactivos      // Optionally, add this for stylistic rules

- **shadcn/ui**: Componentes UI estilizados      ...tseslint.configs.stylisticTypeChecked,



## Ejecución      // Other configs...

    ],

### Con Docker (Recomendado)    languageOptions: {

```bash      parserOptions: {

docker-compose up --build        project: ['./tsconfig.node.json', './tsconfig.app.json'],

```        tsconfigRootDir: import.meta.dirname,

      },

### Desarrollo Local      // other options...

```bash    },

# Backend  },

cd backend])

pip install -r requirements.txt```

uvicorn main:app --reload

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

# Frontend

cd frontend```js

npm install// eslint.config.js

npm run devimport reactX from 'eslint-plugin-react-x'

```import reactDom from 'eslint-plugin-react-dom'



## Endpoints APIexport default tseslint.config([

  globalIgnores(['dist']),

- `GET /ventas_por_dia` - Ventas agrupadas por día  {

- `GET /rutas` - Rutas de vendedores con coordenadas    files: ['**/*.{ts,tsx}'],

- `GET /clientes` - Listado de clientes con ubicación    extends: [

- `GET /kpis` - KPIs comerciales generales      // Other configs...

      // Enable lint rules for React

## Características      reactX.configs['recommended-typescript'],

      // Enable lint rules for React DOM

- ✅ Dashboard responsive      reactDom.configs.recommended,

- ✅ Gráficos interactivos    ],

- ✅ Mapas con rutas y clientes    languageOptions: {

- ✅ KPIs en tiempo real      parserOptions: {

- ✅ Código modular y escalable        project: ['./tsconfig.node.json', './tsconfig.app.json'],

- ✅ Containerización completa        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
