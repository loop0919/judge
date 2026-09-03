package main

import "testing"

func TestListenAddress(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		value   string
		set     bool
		want    string
		wantErr bool
	}{
		{name: "default", want: ":8080"},
		{name: "configured", value: "3000", set: true, want: ":3000"},
		{name: "not a number", value: "http", set: true, wantErr: true},
		{name: "empty", value: "", set: true, wantErr: true},
		{name: "too small", value: "0", set: true, wantErr: true},
		{name: "too large", value: "65536", set: true, wantErr: true},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()

			got, err := listenAddress(func(string) (string, bool) {
				return test.value, test.set
			})

			if test.wantErr {
				if err == nil {
					t.Fatalf("listenAddress() error = nil, want an error")
				}

				return
			}

			if err != nil {
				t.Fatalf("listenAddress() error = %v", err)
			}

			if got != test.want {
				t.Errorf("listenAddress() = %q, want %q", got, test.want)
			}
		})
	}
}
