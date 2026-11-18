# Firma de la distribución de Windows

El workflow Release publica `OpenRoute-Setup.exe` para etiquetas que coincidan con la versión de `package.json`. Antes de publicar comprueba que el instalador y el ejecutable de la aplicación tengan una firma Authenticode válida del editor esperado y un sello de tiempo. El archivo `.sha256` que acompaña al instalador corresponde a su contenido después de firmarlo.

## Activar Azure Artifact Signing

1. Crea una cuenta de [Azure Artifact Signing](https://learn.microsoft.com/azure/artifact-signing/quickstart) y completa la validación de la identidad que aparecerá como editor. Crea un perfil de certificado **Public Trust** en la misma región.
2. Configura una aplicación de Microsoft Entra con una credencial federada de GitHub Actions. Usa el emisor `https://token.actions.githubusercontent.com`, la audiencia `api://AzureADTokenExchange` y el sujeto `repo:ComunidadIA-OS/OpenRoute:environment:windows-release`. Crea el [entorno de GitHub](https://docs.github.com/actions/deployment/targeting-different-environments/managing-environments-for-deployment) `windows-release` y configura qué etiquetas pueden usarlo. [Guía de Azure para OIDC](https://learn.microsoft.com/azure/developer/github/connect-from-azure-openid-connect)
3. Concede a la identidad de CI el rol **Artifact Signing Certificate Profile Signer** en el perfil de certificado. [Guía de asignación del rol](https://learn.microsoft.com/azure/artifact-signing/tutorial-assign-roles)
4. Añade las variables al entorno `windows-release`.

| Variable | Valor |
| --- | --- |
| `AZURE_CLIENT_ID` | ID de aplicación de Microsoft Entra |
| `AZURE_TENANT_ID` | ID del inquilino de Microsoft Entra |
| `AZURE_SUBSCRIPTION_ID` | ID de la suscripción de Azure |
| `WINDOWS_SIGNING_ENDPOINT` | [URL HTTPS regional](https://learn.microsoft.com/azure/artifact-signing/how-to-signing-integrations) de la cuenta |
| `WINDOWS_SIGNING_ACCOUNT` | Nombre de la cuenta de Artifact Signing |
| `WINDOWS_SIGNING_PROFILE` | Nombre del perfil Public Trust |
| `WINDOWS_SIGNING_PUBLISHER` | Nombre común (CN) exacto del certificado, con sus espacios y tildes |

El runner inicia sesión en Azure CLI mediante OIDC. Electron Builder 26 usa ese inicio de sesión a través del módulo TrustedSigning y solicita SHA-256 para la firma y el sello RFC 3161. La identidad federada evita guardar un secreto de cliente o un archivo PFX en GitHub. [Configuración de firma para Electron Builder 26](https://www.electron.build/v26/docs/features/code-signing/code-signing-win/)

## Opciones si aún no tienes identidad de firma

- **Pruebas privadas.** `npm run dist:win` crea un instalador local sin firma si no configuraste un certificado. La publicación oficial exige Authenticode.
- **SignPath Foundation.** Los proyectos de código abierto que cumplan las condiciones pueden solicitar firma gratuita. La fundación revisa la licencia, el proyecto y la trazabilidad de las compilaciones. Si acepta OpenRoute, habría que integrar SignPath en el flujo de publicación. [Condiciones de SignPath Foundation](https://signpath.org/terms)
- **Microsoft Store.** La tienda firma los paquetes MSIX/AppX que aprueba. Requiere preparar un paquete MSIX/AppX y tramitar la publicación en la tienda. Para un instalador EXE o MSI, Microsoft requiere la firma del editor al presentar el archivo. [Firma de paquetes en Microsoft Store](https://learn.microsoft.com/windows/apps/publish/faq/get-started-with-the-microsoft-store)
- **Certificado de una autoridad certificadora.** Consulta las opciones de firma para el titular del proyecto en su país y las condiciones de validación. La lista de países elegibles para Artifact Signing depende del tipo de identidad. [Opciones de firma para aplicaciones Windows](https://learn.microsoft.com/windows/apps/package-and-deploy/code-signing-options) · [Elegibilidad de Azure Artifact Signing](https://learn.microsoft.com/azure/artifact-signing/quickstart)
