; Las descargas de ambos idiomas contienen los mismos bytes firmados.
!macro customInit
  Push $0
  StrCpy $0 $EXEFILE 20
  ${If} $EXEFILE == "OpenRoute-Setup-es.exe"
  ${OrIf} $0 == "OpenRoute-Setup-es ("
    StrCpy $LANGUAGE ${LANG_SPANISHINTERNATIONAL}
  ${ElseIf} $EXEFILE == "OpenRoute-Setup-en.exe"
  ${OrIf} $0 == "OpenRoute-Setup-en ("
    StrCpy $LANGUAGE ${LANG_ENGLISH}
  ${Else}
    System::Call 'kernel32::GetUserDefaultUILanguage() i.r0'
    IntOp $0 $0 & 0x3ff
    ${If} $0 == 10
      StrCpy $LANGUAGE ${LANG_SPANISHINTERNATIONAL}
    ${Else}
      StrCpy $LANGUAGE ${LANG_ENGLISH}
    ${EndIf}
  ${EndIf}
  Pop $0
!macroend

!macro customInstall
  Push $0
  Push $1
  StrCpy $1 "en"
  ${If} $LANGUAGE == ${LANG_SPANISHINTERNATIONAL}
    StrCpy $1 "es"
  ${EndIf}
  ClearErrors
  FileOpen $0 "$INSTDIR\resources\installer-language" w
  ${IfNot} ${Errors}
    FileWrite $0 "$1"
    FileClose $0
  ${EndIf}
  Pop $1
  Pop $0
!macroend
