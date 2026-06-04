# 🌐 Provisiones Santa Martha — Frontend

> Aplicación web desarrollada en **Angular 21** para la gestión de contratos funerarios, pagos, cobros y planes de la **Sociedad Humanista Santa Martha S.A. de C.V.**

---

## 📋 Tabla de Contenidos

- [Descripción](#descripción)
- [Arquitectura](#arquitectura)
- [Tecnologías y Dependencias](#tecnologías-y-dependencias)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Rutas de la Aplicación](#rutas-de-la-aplicación)
- [Variables de Entorno](#variables-de-entorno)
- [Instalación y Ejecución](#instalación-y-ejecución)
- [Build para Producción](#build-para-producción)

---

## 📖 Descripción

Portal web tipo SPA (Single Page Application) que permite a clientes y administradores gestionar:

- 👤 **Mis datos** — perfil del cliente
- 📄 **Contratos** — visualización de contratos funerarios
- 💰 **Cobros** — historial y estado de cobros programados
- 📦 **Plan funerario** — detalle del plan contratado
- 👨‍👩‍👧 **Beneficiarios** — gestión de beneficiarios del contrato
- 🔔 **Notificaciones** — alertas y avisos del sistema
- 🛠️ **Panel administrativo** — acceso exclusivo para administradores
- ℹ️ **Información** — información pública de la empresa

---

## 🏗️ Arquitectura

**SPA (Single Page Application)** con arquitectura basada en **componentes standalone** de Angular 21, separada en capas:

```
src/app/
├── core/          → Guards, Interceptores, Modelos, Servicios
├── layout/        → Layouts reutilizables (portal con navbar/footer)
├── pages/         → Páginas/vistas de la aplicación
└── shared/        → Componentes compartidos (navbar, footer)
```

### Patrones utilizados

| Patrón | Implementación |
|--------|---------------|
| **Lazy Loading** | Todas las páginas se cargan bajo demanda con `loadComponent` |
| **Guard Pattern** | `authGuard` y `adminGuard` protegen rutas privadas |
| **Interceptor Pattern** | `authInterceptor` inyecta el token JWT en cada petición HTTP |
| **Service Layer** | Servicios en `core/services/` centralizan la lógica de API |
| **Model/DTO Pattern** | Interfaces TypeScript en `core/models/` tipan las respuestas |

---

## 🛠️ Tecnologías y Dependencias

### Dependencias principales

| Paquete | Versión | Descripción |
|---------|---------|-------------|
| **@angular/core** | ^21.2.0 | Framework principal |
| **@angular/router** | ^21.2.0 | Enrutamiento SPA con lazy loading |
| **@angular/forms** | ^21.2.0 | Formularios reactivos y template-driven |
| **@angular/common/http** | ^21.2.0 | Cliente HTTP con interceptores |
| **@angular/platform-browser** | ^21.2.0 | Integración con el DOM |
| **rxjs** | ~7.8.0 | Programación reactiva (Observables) |
| **tslib** | ^2.3.0 | Utilidades TypeScript en runtime |

### Dependencias de desarrollo

| Paquete | Versión | Descripción |
|---------|---------|-------------|
| **@angular/cli** | ^21.2.13 | CLI de Angular |
| **@angular/build** | ^21.2.13 | Builder con Vite |
| **typescript** | ~5.9.2 | Lenguaje principal |
| **prettier** | ^3.8.1 | Formateo de código |
| **vitest** | ^4.0.8 | Testing unitario |
| **jsdom** | ^28.0.0 | DOM virtual para tests |

---

## 📁 Estructura del Proyecto

```
src/
├── index.html
├── main.ts
├── styles.css
├── environments/
│   └── environment.ts          # URL base de la API
└── app/
    ├── app.ts                  # Componente raíz
    ├── app.config.ts           # Configuración (providers, interceptores)
    ├── app.routes.ts           # Definición de rutas
    ├── core/
    │   ├── guards/
    │   │   └── auth.guard.ts   # authGuard y adminGuard
    │   ├── interceptors/
    │   │   └── auth.interceptor.ts  # Inyección automática de JWT
    │   ├── models/             # Interfaces TypeScript
    │   │   ├── auth.model.ts
    │   │   ├── persona.model.ts
    │   │   ├── contrato.model.ts
    │   │   ├── beneficiario.model.ts
    │   │   ├── cobro.model.ts
    │   │   └── notificacion.model.ts
    │   └── services/           # Servicios de comunicación con la API
    │       ├── auth.service.ts
    │       ├── persona.service.ts
    │       ├── contrato.service.ts
    │       ├── cobro.service.ts
    │       └── notificacion.service.ts
    ├── layout/
    │   └── portal-layout/      # Layout con navbar y footer para rutas protegidas
    ├── pages/
    │   ├── inicio-publico/     # Página principal pública
    │   ├── login/
    │   ├── registro/
    │   ├── portal-inicio/      # Dashboard del cliente
    │   ├── mis-datos/
    │   ├── cobros/
    │   ├── plan-funerario/
    │   ├── beneficiarios/
    │   ├── notificaciones/
    │   ├── informacion/
    │   └── panel-admin/        # Solo accesible con rol admin
    └── shared/
        ├── navbar/
        └── footer/
```

---

## 🗺️ Rutas de la Aplicación

| Ruta | Componente | Acceso |
|------|-----------|--------|
| `/inicio` | `InicioPublicoComponent` | Público |
| `/login` | `LoginComponent` | Público |
| `/registro` | `RegistroComponent` | Público |
| `/portal/inicio` | `PortalInicioComponent` | Autenticado |
| `/portal/mis-datos` | `MisDatosComponent` | Autenticado |
| `/portal/cobros` | `CobrosComponent` | Autenticado |
| `/portal/plan-funerario` | `PlanFunerarioComponent` | Autenticado |
| `/portal/beneficiarios` | `BeneficiariosComponent` | Autenticado |
| `/portal/notificaciones` | `NotificacionesComponent` | Autenticado |
| `/portal/informacion` | `InformacionComponent` | Autenticado |
| `/portal/admin` | `PanelAdminComponent` | Solo Admin |

---

## ⚙️ Variables de Entorno

Edita `src/environments/environment.ts` según tu entorno:

```typescript
// Desarrollo
export const environment = {
  production: false,
  apiUrl: 'http://localhost:8081/api'
};
```

Para producción, crea `src/environments/environment.prod.ts`:

```typescript
export const environment = {
  production: true,
  apiUrl: 'https://tu-dominio.com/api'
};
```

---

## 🚀 Instalación y Ejecución

### Prerrequisitos
- Node.js 20+
- npm 11+
- Angular CLI 21: `npm install -g @angular/cli`

### Pasos

```bash
# 1. Clona el repositorio
git clone https://github.com/arrova931026/ProvisionesSantaMartha_frontend.git
cd ProvisionesSantaMartha_frontend

# 2. Instala dependencias
npm install

# 3. Levanta el servidor de desarrollo
npm start
```

La app estará disponible en: **http://localhost:4200**

> Asegúrate de tener el backend corriendo en `http://localhost:8081`

---

## 🏗️ Build para Producción

```bash
npm run build
```

Los archivos compilados se generan en `dist/provisiones-santa-martha/`.

---

## 🔐 Seguridad

- El `authInterceptor` añade automáticamente el header `Authorization: Bearer <token>` a todas las peticiones HTTP
- `authGuard` redirige a `/login` si el usuario no está autenticado
- `adminGuard` redirige al portal si el usuario no tiene rol de administrador
- El token JWT se almacena y gestiona desde `AuthService`

---

## 🔗 Repositorio relacionado

Backend (Spring Boot): [ProvisionesSantaMartha_services](https://github.com/arrova931026/ProvisionesSantaMartha_services)

---

## 👨‍💻 Autor

**Provisiones Santa Martha** — Sociedad Humanista Santa Martha S.A. de C.V.

---

## 📄 Licencia

Proyecto de uso privado para **Sociedad Humanista Santa Martha S.A. de C.V.**