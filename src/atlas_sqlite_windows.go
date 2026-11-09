//go:build windows

package main

// Windows ships winsqlite3.dll on supported Windows 10/11 installations.
// We use its published SQLite C ABI in strictly read-only mode; no setup,
// Python or third-party executable is needed to read the user's GeoPackage.
import (
	"errors"
	"fmt"
	"runtime"
	"syscall"
	"unsafe"
)

var winSQLite = syscall.NewLazyDLL("winsqlite3.dll")
var sqliteOpen = winSQLite.NewProc("sqlite3_open_v2")
var sqliteClose = winSQLite.NewProc("sqlite3_close")
var sqlitePrepare = winSQLite.NewProc("sqlite3_prepare_v2")
var sqliteStep = winSQLite.NewProc("sqlite3_step")
var sqliteFinalize = winSQLite.NewProc("sqlite3_finalize")
var sqliteColumnCount = winSQLite.NewProc("sqlite3_column_count")
var sqliteColumnType = winSQLite.NewProc("sqlite3_column_type")
var sqliteColumnBlob = winSQLite.NewProc("sqlite3_column_blob")
var sqliteColumnBytes = winSQLite.NewProc("sqlite3_column_bytes")
var sqliteColumnText = winSQLite.NewProc("sqlite3_column_text")
var sqliteErrmsg = winSQLite.NewProc("sqlite3_errmsg")

type atlasDB struct{ ptr uintptr }

func cString(s string) []byte { b := append([]byte(s), 0); return b }
func (d *atlasDB) msg() string {
	ptr, _, _ := sqliteErrmsg.Call(d.ptr)
	if ptr == 0 {
		return "SQLite Fehler"
	}
	b := make([]byte, 0, 160)
	for i := 0; i < 250; i++ {
		x := *(*byte)(unsafe.Pointer(ptr + uintptr(i)))
		if x == 0 {
			break
		}
		b = append(b, x)
	}
	return string(b)
}
func openAtlasDB(path string) (*atlasDB, error) {
	if err := winSQLite.Load(); err != nil {
		return nil, fmt.Errorf("Windows SQLite-Schnittstelle nicht verfügbar: %w", err)
	}
	var p uintptr
	name := cString(path)
	rc, _, _ := sqliteOpen.Call(uintptr(unsafe.Pointer(&name[0])), uintptr(unsafe.Pointer(&p)), 1, 0) // SQLITE_OPEN_READONLY
	runtime.KeepAlive(name)
	if rc != 0 {
		if p != 0 {
			d := &atlasDB{p}
			e := errors.New(d.msg())
			d.Close()
			return nil, e
		}
		return nil, fmt.Errorf("SQLite Öffnen: Code %d", rc)
	}
	return &atlasDB{p}, nil
}
func (d *atlasDB) Close() {
	if d.ptr != 0 {
		sqliteClose.Call(d.ptr)
		d.ptr = 0
	}
}
func (d *atlasDB) rows(sql string, maximum int, fn func([][]byte) error) error {
	query := cString(sql)
	var stmt uintptr
	rc, _, _ := sqlitePrepare.Call(d.ptr, uintptr(unsafe.Pointer(&query[0])), uintptr(len(query)-1), uintptr(unsafe.Pointer(&stmt)), 0)
	runtime.KeepAlive(query)
	if rc != 0 {
		return fmt.Errorf("SQL-Abfrage: %s", d.msg())
	}
	defer sqliteFinalize.Call(stmt)
	cols, _, _ := sqliteColumnCount.Call(stmt)
	if cols > 20 {
		return errors.New("zu viele Spalten")
	}
	for i := 0; i < maximum; i++ {
		code, _, _ := sqliteStep.Call(stmt)
		if code == 101 {
			return nil
		} // SQLITE_DONE
		if code != 100 {
			return fmt.Errorf("SQLite lesen: %s", d.msg())
		}
		row := make([][]byte, int(cols))
		for j := 0; j < int(cols); j++ {
			kind, _, _ := sqliteColumnType.Call(stmt, uintptr(j))
			if kind == 5 {
				continue
			}
			length, _, _ := sqliteColumnBytes.Call(stmt, uintptr(j))
			if length > 4_000_000 {
				return errors.New("Einzelgeometrie zu groß (max 4 MB)")
			}
			ptr := uintptr(0)
			if kind == 4 {
				ptr, _, _ = sqliteColumnBlob.Call(stmt, uintptr(j))
			} else {
				ptr, _, _ = sqliteColumnText.Call(stmt, uintptr(j))
			}
			if ptr != 0 && length > 0 {
				row[j] = append([]byte(nil), unsafe.Slice((*byte)(unsafe.Pointer(ptr)), int(length))...)
			}
		}
		if err := fn(row); err != nil {
			return err
		}
	}
	return nil
}
